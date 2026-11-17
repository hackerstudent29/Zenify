import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:sensors_plus/sensors_plus.dart';
import 'package:video_player/video_player.dart';

import '../../design_system/tokens/app_colors.dart';
import '../../design_system/widgets/interactive_artists_text.dart';
import '../../design_system/widgets/zen_dropdown.dart';
import '../../design_system/zen.dart';
import '../../features/story_sharing/story_sharing.dart';
import '../../models/playback_context.dart';
import '../../models/track.dart';
import '../../services/download_service.dart';
import '../../services/innertube_service.dart';
import '../../services/library_store.dart';
import '../../services/player_state.dart';
import '../../utils/media_normalizer.dart';
import 'artist_popup.dart';
import 'artist_screen.dart';

/* ------------------------------------------------------------------ */
/*  Spring primitives                                                   */
/* ------------------------------------------------------------------ */
const _kPress = SpringDescription(mass: 1, stiffness: 430, damping: 21);
const _kReveal = SpringDescription(mass: 1, stiffness: 170, damping: 22);

/// Curve driven by a real spring so implicit animations overshoot and settle.
class _SpringCurve extends Curve {
  const _SpringCurve();
  static final _sim =
      SpringSimulation(const SpringDescription(mass: 1, stiffness: 200, damping: 17), 0, 1, 0);
  @override
  double transformInternal(double t) => _sim.x(t * 0.9);
}

const _spring = _SpringCurve();

/// Press-and-release with a real spring (squishy like iOS).
class _Press extends StatefulWidget {
  const _Press({required this.child, this.onTap, this.scale = 0.96});
  final Widget child;
  final VoidCallback? onTap;
  final double scale;

  @override
  State<_Press> createState() => _PressState();
}

class _PressState extends State<_Press> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController.unbounded(vsync: this, value: 1);
  void _to(double v) => _c.animateWith(SpringSimulation(_kPress, _c.value, v, 0));

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: (_) => _to(widget.scale),
        onTapUp: (_) => _to(1),
        onTapCancel: () => _to(1),
        onTap: widget.onTap,
        child: AnimatedBuilder(
          animation: _c,
          child: widget.child,
          builder: (_, child) => Transform.scale(scale: _c.value, child: child),
        ),
      );
}

/// Fade + rise entrance driven by a spring.
class _Reveal extends StatefulWidget {
  const _Reveal({required this.child, this.delay = Duration.zero, this.rise = 24});
  final Widget child;
  final Duration delay;
  final double rise;

  @override
  State<_Reveal> createState() => _RevealState();
}

class _RevealState extends State<_Reveal> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController.unbounded(vsync: this, value: 0);
  Timer? _t;

  @override
  void initState() {
    super.initState();
    void go() => _c.animateWith(SpringSimulation(_kReveal, 0, 1, 0));
    if (widget.delay == Duration.zero) {
      go();
    } else {
      _t = Timer(widget.delay, () {
        if (mounted) go();
      });
    }
  }

  @override
  void dispose() {
    _t?.cancel();
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _c,
        child: widget.child,
        builder: (_, child) => Opacity(
          opacity: _c.value.clamp(0.0, 1.0).toDouble(),
          child: Transform.translate(offset: Offset(0, (1 - _c.value) * widget.rise), child: child),
        ),
      );
}

class _SnapPhysics extends ScrollPhysics {
  const _SnapPhysics({super.parent, required this.itemExtent});
  final double itemExtent;

  @override
  _SnapPhysics applyTo(ScrollPhysics? ancestor) =>
      _SnapPhysics(parent: buildParent(ancestor), itemExtent: itemExtent);

  @override
  SpringDescription get spring =>
      SpringDescription.withDampingRatio(mass: 0.5, stiffness: 120, ratio: 1.05);

  @override
  Simulation? createBallisticSimulation(ScrollMetrics m, double velocity) {
    if ((velocity <= 0 && m.pixels <= m.minScrollExtent) || (velocity >= 0 && m.pixels >= m.maxScrollExtent)) {
      return super.createBallisticSimulation(m, velocity);
    }
    final page = m.pixels / itemExtent;
    final tol = toleranceFor(m).velocity;
    final t = velocity < -tol ? page.floorToDouble() : velocity > tol ? page.ceilToDouble() : page.roundToDouble();
    final target = (t * itemExtent).clamp(m.minScrollExtent, m.maxScrollExtent).toDouble();
    if ((target - m.pixels).abs() < 0.5) return null;
    return ScrollSpringSimulation(spring, m.pixels, target, velocity, tolerance: toleranceFor(m));
  }

  @override
  bool get allowImplicitScrolling => false;
}

/* ------------------------------------------------------------------ */
/*  Small widgets                                                       */
/* ------------------------------------------------------------------ */
class _Img extends StatelessWidget {
  const _Img(this.url, {this.radius = 10});
  final String url;
  final double radius;

  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: CachedNetworkImage(
          imageUrl: url,
          fit: BoxFit.cover,
          width: double.infinity,
          height: double.infinity,
          fadeInDuration: const Duration(milliseconds: 260),
          placeholder: (context, url) => Container(color: AppColors.surface2),
          errorWidget: (context, url, error) => Container(
            color: AppColors.surface2,
            child: const Icon(Icons.music_note_rounded, color: AppColors.textTertiary),
          ),
        ),
      );
}

class _Eq extends StatefulWidget {
  const _Eq({required this.playing});
  final bool playing;

  @override
  State<_Eq> createState() => _EqState();
}

class _EqState extends State<_Eq> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1100));

  @override
  void initState() {
    super.initState();
    if (widget.playing) _c.repeat();
  }

  @override
  void didUpdateWidget(covariant _Eq old) {
    super.didUpdateWidget(old);
    if (widget.playing && !_c.isAnimating) _c.repeat();
    if (!widget.playing) _c.stop();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _c,
        builder: (context, child) => Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: List.generate(4, (i) {
            final v = widget.playing
                ? 0.3 + 0.7 * (0.5 + 0.5 * math.sin(_c.value * 2 * math.pi * (1 + i * 0.35) + i * 1.3))
                : 0.28;
            return Container(
              width: 3,
              height: 13 * v,
              margin: const EdgeInsets.only(right: 2),
              decoration: BoxDecoration(color: AppColors.accent, borderRadius: BorderRadius.circular(1.5)),
            );
          }),
        ),
      );
}

class _SecHeader extends StatelessWidget {
  const _SecHeader(this.title);
  final String title;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 28, 20, 12),
        child: Text(
          title,
          style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700, letterSpacing: -0.4),
        ),
      );
}


/// Round translucent button used in the action row (shuffle / add).
class _ActionCircle extends StatelessWidget {
  const _ActionCircle({required this.child, required this.onTap, this.active = false});
  final Widget child;
  final VoidCallback onTap;
  final bool active;

  @override
  Widget build(BuildContext context) => _Press(
        scale: 0.86,
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 600),
          curve: _spring,
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: active ? 0.28 : 0.18),
            shape: BoxShape.circle,
          ),
          alignment: Alignment.center,
          child: child,
        ),
      );
}

/// A release grouped from search results.
class _Release {
  _Release(this.title, this.artist, this.cover);
  final String title, artist, cover;
  int count = 0;
}

List<_Release> _group(Iterable<Track> tracks, {String? skip}) {
  final map = <String, _Release>{};
  for (final t in tracks) {
    final a = t.album;
    final key = a.isEmpty ? t.title : a;
    if (skip != null && key.toLowerCase() == skip.toLowerCase()) continue;
    final r = map.putIfAbsent(key, () => _Release(key, t.artist, t.coverUrl));
    r.count++;
  }
  return map.values.toList();
}

/// Asks Google-hosted thumbnails for a larger rendition (they are often 60px).
String _hq(String url) {
  if (!(url.contains('googleusercontent') || url.contains('ggpht'))) return url;
  var u = url.replaceAllMapped(RegExp(r'=w\d+-h\d+[^/]*$'), (_) => '=w900-h900-l90-rj');
  u = u.replaceAllMapped(RegExp(r'=s\d+$'), (_) => '=s900');
  return u;
}

/* ------------------------------------------------------------------ */
/*  Screen                                                              */
/* ------------------------------------------------------------------ */
class AlbumScreen extends StatefulWidget {
  const AlbumScreen({
    super.key,
    required this.albumTitle,
    required this.artistName,
    this.coverUrl,
    this.initialTracks,
    this.browseId,
    this.motionUrl,
  });

  final String albumTitle;
  final String artistName;
  final String? coverUrl;
  final List<Track>? initialTracks;
  final String? browseId;

  /// Optional short muted video loop (Apple-style motion artwork).
  final String? motionUrl;

  @override
  State<AlbumScreen> createState() => _AlbumScreenState();
}

class _AlbumScreenState extends State<AlbumScreen> with TickerProviderStateMixin {
  final _sc = ScrollController();
  List<Track> _tracks = [];
  List<Track> _artistPool = [];
  bool _loading = true;
  bool _expanded = false;
  String? _resolvedCover;

  // Rich metadata fields
  String? _resolvedAlbumTitle;
  String? _resolvedArtistName;
  List<String> _albumArtists = [];
  int? _releaseYear;
  String? _recordLabel;
  String? _albumType;
  String? _description;

  // Cover analysis: dominant colour + whether the image is sharp enough
  // to be shown full-bleed (otherwise it is shown as an inset square).
  Color _tint = const Color(0xFF3A3A3C);
  String? _coverKey;

  // ---- Living cover ----
  /// Flip to -1 if the tilt parallax feels inverted on your device.
  static const double _kTiltSign = 1;
  late final AnimationController _live =
      AnimationController(vsync: this, duration: const Duration(seconds: 24));
  late final AnimationController _glow =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 5200));
  final ValueNotifier<Offset> _tilt = ValueNotifier(Offset.zero);
  StreamSubscription<AccelerometerEvent>? _accel;
  Offset? _neutral;
  VideoPlayerController? _video;
  bool _videoReady = false;
  bool _animatedCover = false; // GIF / animated WebP: no fake drift on top
  bool _reduceMotion = false;
  bool _routeActive = true;
  bool _scrolling = false;
  bool _heroVisible = true;
  double _heroH = 420;

  bool get _driftOn => !_animatedCover && !_videoReady;

  @override
  void initState() {
    super.initState();
    final init = widget.initialTracks;
    if (init != null && init.isNotEmpty) {
      _tracks = init;
      _inspectTracksMetadata();
      // If only 1 placeholder song was passed, keep loading spinner active while fetching full album
      _loading = init.length <= 1;
    } else {
      _loading = true;
    }
    _loadAlbum();
    _loadMore();
    LibraryStore.instance.ensureLoaded();
    LibraryStore.instance.addListener(_onLibrary);
    _sc.addListener(_onScroll);
    final mu = widget.motionUrl;
    if (mu != null && mu.isNotEmpty) _initVideo(mu);
    WidgetsBinding.instance.addPostFrameCallback((_) => _syncMotion());
  }

  /* ------------------------- living cover ------------------------ */
  Future<void> _initVideo(String url) async {
    try {
      final c = VideoPlayerController.networkUrl(
        Uri.parse(url),
        videoPlayerOptions: VideoPlayerOptions(mixWithOthers: true),
      );
      _video = c;
      await c.initialize();
      if (!mounted) return;
      await c.setLooping(true);
      await c.setVolume(0);
      setState(() => _videoReady = true);
      _syncMotion();
    } catch (_) {
      _video = null;
    }
  }

  void _onScroll() {
    final vis = _offset < _heroH * 0.8;
    if (vis != _heroVisible) {
      _heroVisible = vis;
      _syncMotion();
    }
  }

  bool _onScrollNote(ScrollNotification n) {
    if (n.depth != 0 || n.metrics.axis != Axis.vertical) return false;
    if (n is ScrollStartNotification && !_scrolling) {
      _scrolling = true;
      _syncMotion();
    } else if (n is ScrollEndNotification && _scrolling) {
      _scrolling = false;
      _syncMotion();
    }
    return false;
  }

  /// One place that decides what is allowed to move right now:
  /// nothing when reduce-motion is on, the screen is covered, or the hero is
  /// off-screen; drift/breathing also rest while the finger is scrolling.
  void _syncMotion() {
    if (!mounted) return;
    final canRun = !_reduceMotion && _routeActive && _heroVisible;
    if (canRun && !_scrolling) {
      if (!_live.isAnimating) _live.repeat(reverse: true);
      if (!_glow.isAnimating) _glow.repeat(reverse: true);
    } else {
      _live.stop();
      _glow.stop();
    }
    if (canRun) {
      _startTilt();
    } else {
      _stopTilt();
    }
    if (_reduceMotion) _tilt.value = Offset.zero;
    final v = _video;
    if (v != null && _videoReady) {
      if (canRun) {
        v.play();
      } else {
        v.pause();
      }
    }
  }

  void _startTilt() {
    if (_accel != null) return;
    try {
      _accel = accelerometerEventStream(samplingPeriod: SensorInterval.gameInterval).listen(
        (e) {
          // The angle you are holding the phone at slowly becomes "centre".
          final n = _neutral ??= Offset(e.x, e.y);
          _neutral = Offset(n.dx + (e.x - n.dx) * 0.004, n.dy + (e.y - n.dy) * 0.004);
          final tx = ((e.x - n.dx) / 4.5 * _kTiltSign).clamp(-1.0, 1.0).toDouble();
          final ty = ((e.y - n.dy) / 4.5 * _kTiltSign).clamp(-1.0, 1.0).toDouble();
          final c = _tilt.value;
          // low-pass filter = silky, never jittery
          _tilt.value = Offset(c.dx + (tx - c.dx) * 0.12, c.dy + (ty - c.dy) * 0.12);
        },
        onError: (_) {},
      );
    } catch (_) {}
  }

  void _stopTilt() {
    _accel?.cancel();
    _accel = null;
  }

  /// Backdrop / edge colour that gently "breathes" toward the cover tint.
  Color _breathe(Color base) =>
      Color.lerp(base, _tint, 0.2 * Curves.easeInOut.transform(_glow.value))!;

  void _onLibrary() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    LibraryStore.instance.removeListener(_onLibrary);
    _sc.removeListener(_onScroll);
    _accel?.cancel();
    _live.dispose();
    _glow.dispose();
    _tilt.dispose();
    _video?.dispose();
    _sc.dispose();
    super.dispose();
  }

  /* ---------------------------- data ---------------------------- */
  Future<void> _loadAlbum() async {
    try {
      var bId = widget.browseId ?? '';
      final firstTrack = widget.initialTracks?.isNotEmpty == true ? widget.initialTracks!.first : null;
      if (bId.isEmpty && firstTrack?.albumBrowseId != null && firstTrack!.albumBrowseId!.isNotEmpty) {
        bId = firstTrack.albumBrowseId!;
      }

      // If we were opened from a song (firstTrack != null), NEVER treat bId as a playlist!
      // A song belongs to its original album, not a user-created or curated playlist.
      final bool isExplicitPlaylist = firstTrack == null &&
          (bId.startsWith('VLPL') || bId.startsWith('PL') || bId.startsWith('RD'));

      if (isExplicitPlaylist) {
        final pRes = await InnerTubeService.instance.getPlaylist(bId);
        if (pRes != null && pRes.tracks.isNotEmpty) {
          if (mounted) {
            setState(() {
              _tracks = pRes.tracks;
              if (pRes.coverUrl.isNotEmpty) _resolvedCover = pRes.coverUrl;
              if (pRes.title.isNotEmpty) _resolvedAlbumTitle = MediaNormalizer.cleanAlbumTitle(pRes.title);
              if (pRes.author.isNotEmpty) _resolvedArtistName = MediaNormalizer.formatArtists(pRes.author);
              _loading = false;
            });
            _inspectTracksMetadata();
          }
          return;
        }
      }

      // If bId is a playlist ID but we have a song, discard the playlist ID so it doesn't hijack the album view
      if (bId.startsWith('VLPL') || bId.startsWith('PL') || bId.startsWith('RD')) {
        bId = '';
      }

      // If bId is missing or not a true album release ID (MPREb_), resolve the song's true album from YouTube Music!
      if ((bId.isEmpty || !bId.startsWith('MPREb_')) && firstTrack != null) {
        final details = await InnerTubeService.instance.resolveSongAlbumDetails(firstTrack.id);
        if (details != null) {
          if (details.albumBrowseId != null && details.albumBrowseId!.isNotEmpty) {
            bId = details.albumBrowseId!;
          }
          if (details.albumTitle != null && details.albumTitle!.isNotEmpty) {
            _resolvedAlbumTitle = MediaNormalizer.cleanAlbumTitle(details.albumTitle!);
          }
          if (details.artistName != null && details.artistName!.isNotEmpty) {
            _resolvedArtistName = MediaNormalizer.formatArtists(details.artistName!);
          }
        }
      }

      final res = await InnerTubeService.instance.getAlbum(
        bId,
        albumTitle: MediaNormalizer.stripIdNoise(MediaNormalizer.cleanTitle(_resolvedAlbumTitle ?? widget.albumTitle)),
        artistName: MediaNormalizer.stripIdNoise(MediaNormalizer.formatArtists(_resolvedArtistName ?? widget.artistName)),
        videoId: firstTrack?.id,
        songTitle: firstTrack?.title,
      );
      if (res != null && res.tracks.isNotEmpty) {
        if (mounted) {
          setState(() {
            _tracks = res.tracks;
            if (res.coverUrl.isNotEmpty) _resolvedCover = res.coverUrl;
            if (res.title != null && res.title!.isNotEmpty) {
              _resolvedAlbumTitle = MediaNormalizer.cleanAlbumTitle(res.title!);
            }
            if (res.artist != null && res.artist!.isNotEmpty) {
              _resolvedArtistName = MediaNormalizer.formatArtists(res.artist!);
            }
            if (res.artists != null && res.artists!.isNotEmpty) {
              _albumArtists = res.artists!;
            }
            if (res.year != null && res.year! > 0) {
              _releaseYear = res.year;
            }
            if (res.label != null && res.label!.isNotEmpty) {
              _recordLabel = res.label;
            }
            if (res.description != null && res.description!.isNotEmpty) {
              _description = res.description;
            }
            _loading = false;
          });
          _inspectTracksMetadata();
        }
        return;
      }

      final r = await InnerTubeService.instance.search(
          '${MediaNormalizer.stripIdNoise(widget.albumTitle)} ${MediaNormalizer.stripIdNoise(widget.artistName)}');
      final exact = r.where((t) => t.album.toLowerCase() == widget.albumTitle.toLowerCase()).toList();
      if (mounted) {
        setState(() {
          _tracks = exact.isNotEmpty ? exact : (r.isNotEmpty ? r : (widget.initialTracks ?? []));
          _loading = false;
        });
        _inspectTracksMetadata();
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _inspectTracksMetadata() {
    if (_tracks.isEmpty) return;

    if (_resolvedAlbumTitle == null || _resolvedAlbumTitle!.isEmpty) {
      final firstAlbum = _tracks.first.album;
      if (firstAlbum.isNotEmpty && firstAlbum != 'Single' && !firstAlbum.startsWith('UC')) {
        _resolvedAlbumTitle = MediaNormalizer.cleanAlbumTitle(firstAlbum);
      }
    }

    if (_resolvedArtistName == null || _resolvedArtistName!.isEmpty) {
      final firstArtist = _tracks.first.artist;
      if (firstArtist.isNotEmpty && !firstArtist.startsWith('UC') && firstArtist != 'Unknown Artist') {
        _resolvedArtistName = MediaNormalizer.formatArtists(firstArtist);
      }
    }

    if (_releaseYear == null) {
      final reg = RegExp(r'\b(19\d\d|20\d\d)\b');
      final match = reg.firstMatch(widget.albumTitle) ?? reg.firstMatch(_tracks.first.album);
      if (match != null) {
        _releaseYear = int.tryParse(match.group(1)!);
      }
    }

    if (mounted) setState(() {});
  }

  Future<void> _loadMore() async {
    try {
      final r = await InnerTubeService.instance.search(widget.artistName);
      if (mounted) setState(() => _artistPool = r);
    } catch (_) {/* optional sections just stay hidden */}
  }

  Future<ui.Image?> _loadImage(ImageProvider provider) async {
    try {
      final stream = provider.resolve(ImageConfiguration.empty);
      final done = Completer<ui.Image>();
      late ImageStreamListener l;
      l = ImageStreamListener(
        (info, _) {
          if (!done.isCompleted) done.complete(info.image.clone());
          stream.removeListener(l);
        },
        onError: (e, _) {
          if (!done.isCompleted) done.completeError(e);
          stream.removeListener(l);
        },
      );
      stream.addListener(l);
      return await done.future.timeout(const Duration(seconds: 10));
    } catch (_) {
      return null;
    }
  }

  /// Reads the cover once from the shared cache and decides:
  ///  * full-bleed vs inset (real pixel width)
  ///  * whether it is already animated (GIF / animated WebP)
  Future<void> _analyzeCover(String url) async {
    var animated = false;
    try {
      final file = await DefaultCacheManager().getSingleFile(_hq(url));
      final codec = await ui.instantiateImageCodec(await file.readAsBytes());
      animated = codec.frameCount > 1;
      final frame = await codec.getNextFrame();
      frame.image.dispose();
      codec.dispose();
    } catch (_) {}
    if (!mounted || _coverKey != url) return;
    setState(() {
      _animatedCover = animated;
    });
  }

  /// Averages the cover into one colour (no extra packages needed).
  Future<void> _extractTint(String url) async {
    try {
      final img = await _loadImage(ResizeImage(CachedNetworkImageProvider(url), width: 16, height: 16));
      if (img == null) return;
      final bd = await img.toByteData(format: ui.ImageByteFormat.rawRgba);
      img.dispose();
      if (bd == null) return;

      double r = 0, g = 0, b = 0, w = 0;
      for (var i = 0; i + 3 < bd.lengthInBytes; i += 4) {
        final pr = bd.getUint8(i).toDouble(), pg = bd.getUint8(i + 1).toDouble(), pb = bd.getUint8(i + 2).toDouble();
        final mx = math.max(pr, math.max(pg, pb)), mn = math.min(pr, math.min(pg, pb));
        final sat = mx == 0 ? 0.0 : (mx - mn) / mx;
        final weight = 0.2 + sat * 2.0;
        r += pr * weight;
        g += pg * weight;
        b += pb * weight;
        w += weight;
      }
      if (w == 0) return;
      final hsl = HSLColor.fromColor(Color.fromARGB(255, (r / w).round(), (g / w).round(), (b / w).round()));
      final tuned = hsl
          .withSaturation(hsl.saturation.clamp(0.25, 0.7).toDouble())
          .withLightness(hsl.lightness.clamp(0.30, 0.46).toDouble())
          .toColor();
      if (mounted && _coverKey == url) setState(() => _tint = tuned);
    } catch (_) {/* keep neutral tint */}
  }

  /* --------------------------- actions -------------------------- */
  void _play(int i, {bool shuffle = false}) {
    if (_tracks.isEmpty) return;
    HapticFeedback.mediumImpact();
    final startIdx = i.clamp(0, _tracks.length - 1);
    final ctx = PlaybackContext(
      type: PlaybackContextType.album,
      id: widget.albumTitle,
      tracks: _tracks,
      startTrack: _tracks[startIdx],
      title: _displayAlbumTitle,
    );
    context.read<PlayerState>().setQueue(
          _tracks,
          startIndex: startIdx,
          shuffle: shuffle,
          collectionLocked: true,
          context: ctx,
        );
  }

  void _openAlbum(_Release r) => Navigator.push(
        context,
        ZenPageRoute(
          builder: (_) => AlbumScreen(albumTitle: r.title, artistName: r.artist, coverUrl: r.cover),
        ),
      );

  void _openArtist([String? specificArtist]) {
    final target = specificArtist ?? _displayArtistName;
    final artists = MediaNormalizer.splitArtistNames(target);
    if (artists.length > 1 && specificArtist == null) {
      showArtistPopup(context, currentArtistName: target);
    } else if (artists.isNotEmpty) {
      Navigator.push(context, ZenPageRoute(builder: (_) => ArtistScreen(artistName: artists.first)));
    }
  }

  void _toggleSaved(String cover) {
    HapticFeedback.mediumImpact();
    LibraryStore.instance.toggleAlbum(widget.albumTitle, widget.artistName, cover);
  }

  void _share() {
    HapticFeedback.selectionClick();
    Clipboard.setData(ClipboardData(text: '$_displayAlbumTitle – $_displayArtistName'));
    IslandNotifier.instance.show(
      IslandNotification(
        id: 'copy_album_${DateTime.now().millisecondsSinceEpoch}',
        title: 'Copied',
        body: IslandNotification.artistOrTitle(artist: _displayArtistName, title: _displayAlbumTitle),
        leading: const Icon(CupertinoIcons.link, color: Color(0xFFE11D48), size: 18),
      ),
    );
  }

  void _showMore(bool saved, String cover) {
    HapticFeedback.selectionClick();
    final dl = DownloadService.instance;
    final allDownloaded = _tracks.isNotEmpty && _tracks.every((t) => dl.isDownloaded(t.id));
    final someDownloading = _tracks.any((t) => dl.isDownloading(t.id));

    ZenDropdown.show<void>(
      context: context,
      title: _displayAlbumTitle,
      subtitle: '$_displayArtistName · $_metaLine',
      coverUrl: cover,
      shareText: '$_displayAlbumTitle – $_displayArtistName',
      shareUrl: 'https://zenify.app/album/${Uri.encodeComponent(_displayAlbumTitle)}',
      items: [
        ZenDropdownItem(
          title: saved ? 'Remove from Library' : 'Add to Library',
          icon: saved ? CupertinoIcons.checkmark_circle_fill : CupertinoIcons.plus_circle,
          onTap: () => _toggleSaved(cover),
        ),
        if (allDownloaded)
          ZenDropdownItem(
            title: 'Remove Album from Downloads',
            subtitle: '${_tracks.length} songs stored offline',
            icon: CupertinoIcons.arrow_down_circle_fill,
            isDestructive: true,
            onTap: () async {
              for (final t in _tracks) {
                await dl.deleteDownload(t.id);
              }
              HapticFeedback.lightImpact();
              IslandNotifier.instance.show(
                IslandNotification(
                  id: 'del_album_dl_${DateTime.now().millisecondsSinceEpoch}',
                  title: 'Downloads Removed',
                  body: '$_displayAlbumTitle removed from offline storage',
                  leading: const Icon(CupertinoIcons.trash, color: Colors.white70, size: 18),
                ),
              );
              if (mounted) setState(() {});
            },
          )
        else if (someDownloading)
          ZenDropdownItem(
            title: 'Downloading Album…',
            subtitle: 'Saving tracks for offline playback',
            icon: CupertinoIcons.arrow_down_circle,
            iconColor: const Color(0xFFE11D48),
            onTap: () {},
          )
        else if (_tracks.isNotEmpty)
          ZenDropdownItem(
            title: 'Download Album',
            subtitle: '${_tracks.length} songs · Under ~${(_tracks.length * 3.8).toStringAsFixed(0)} MB',
            icon: CupertinoIcons.arrow_down_circle,
            iconColor: const Color(0xFFE11D48),
            onTap: () {
              HapticFeedback.mediumImpact();
              IslandNotifier.instance.show(
                IslandNotification(
                  id: 'dl_album_${DateTime.now().millisecondsSinceEpoch}',
                  title: 'Downloading Album',
                  body: 'Downloading ${_tracks.length} songs for offline listening',
                  leading: const Icon(CupertinoIcons.arrow_down_circle, color: Color(0xFFE11D48), size: 18),
                ),
              );
              dl.downloadBulk(_tracks).then((count) {
                IslandNotifier.instance.show(
                  IslandNotification(
                    id: 'dl_album_done_${DateTime.now().millisecondsSinceEpoch}',
                    title: 'Album Downloaded',
                    body: '$count songs from $_displayAlbumTitle saved offline',
                    leading: const Icon(CupertinoIcons.checkmark_circle_fill, color: Color(0xFFE11D48), size: 18),
                  ),
                );
              });
            },
          ),
        ZenDropdownItem(
          title: 'Shuffle Album',
          icon: CupertinoIcons.shuffle,
          onTap: () => _play(0, shuffle: true),
        ),
        ZenDropdownItem(
          title: 'Go to Artist',
          icon: CupertinoIcons.person_circle,
          onTap: _openArtist,
        ),
        ZenDropdownItem(
          title: 'Add to Story',
          icon: CupertinoIcons.paperplane_fill,
          onTap: () {
            Navigator.of(context, rootNavigator: true).push(
              CupertinoPageRoute(
                builder: (_) => StoryPreviewScreen(
                  content: AlbumStoryContent(
                    albumTitle: _displayAlbumTitle,
                    artistName: _displayArtistName,
                    coverUrl: cover,
                    year: _releaseYear?.toString(),
                    trackCount: _tracks.isNotEmpty ? _tracks.length : null,
                    tracks: _tracks,
                  ),
                ),
              ),
            );
          },
        ),
        ZenDropdownItem(
          title: 'Copy Album Link',
          icon: CupertinoIcons.link,
          onTap: _share,
        ),
      ],
    );
  }

  /* -------------------------- derived data ----------------------- */
  String get _displayAlbumTitle {
    if (_resolvedAlbumTitle != null && _resolvedAlbumTitle!.isNotEmpty) {
      return _resolvedAlbumTitle!;
    }
    final t = MediaNormalizer.cleanAlbumTitle(widget.albumTitle);
    if (t.isEmpty || t.startsWith('UC') || t.toLowerCase() == 'single') {
      if (_tracks.isNotEmpty) {
        final a = MediaNormalizer.cleanAlbumTitle(_tracks.first.album);
        if (a.isNotEmpty && a != 'Single' && !a.startsWith('UC')) return a;
        return MediaNormalizer.cleanCompactTitle(_tracks.first.title);
      }
    }
    return t.isNotEmpty ? t : 'Album';
  }

  String get _displayArtistName {
    if (_resolvedArtistName != null && _resolvedArtistName!.isNotEmpty) {
      return _resolvedArtistName!;
    }
    final a = MediaNormalizer.formatArtists(widget.artistName);
    if (a.isEmpty || a.startsWith('UC') || a == 'Unknown Artist') {
      if (_tracks.isNotEmpty && _tracks.first.artist.isNotEmpty && !_tracks.first.artist.startsWith('UC')) {
        return MediaNormalizer.formatArtists(_tracks.first.artist);
      }
    }
    return a.isNotEmpty ? a : 'Artist';
  }

  int get _totalDurationSeconds =>
      _tracks.fold<int>(0, (acc, t) => acc + (t.durationSeconds > 0 ? t.durationSeconds : 0));

  /// Apple-style footer duration: "46 minutes" / "1 hour, 12 minutes".
  String get _footerDuration {
    final sec = _totalDurationSeconds;
    if (sec <= 0) return '';
    final hrs = sec ~/ 3600;
    final mins = (sec % 3600) ~/ 60;
    String m(int n) => '$n ${n == 1 ? 'minute' : 'minutes'}';
    if (hrs > 0) {
      final h = '$hrs ${hrs == 1 ? 'hour' : 'hours'}';
      return mins > 0 ? '$h, ${m(mins)}' : h;
    }
    return mins > 0 ? m(mins) : '$sec seconds';
  }

  String get _computedAlbumType {
    if (_albumType != null && _albumType!.isNotEmpty) return _albumType!;
    final lower = _displayAlbumTitle.toLowerCase();
    if (lower.contains('soundtrack') || RegExp(r'\bost\b').hasMatch(lower)) return 'Soundtrack';
    if (_tracks.length == 1) return 'Single';
    if (_tracks.length >= 2 && _tracks.length <= 6) return 'EP';
    return 'Album';
  }

  /// One short line under the artist: "Album · 2024".
  String get _metaLine {
    final parts = <String>[_computedAlbumType];
    if (_releaseYear != null && _releaseYear! > 0) parts.add('$_releaseYear');
    return parts.join(' · ');
  }

  /// Title size adapts to length so one word and long titles both sit neatly.
  double _titleSize(String t) {
    final n = t.length;
    if (n <= 14) return 28;
    if (n <= 26) return 24;
    if (n <= 42) return 21;
    return 19;
  }

  /* ----------------------------- build ---------------------------- */
  double get _offset => _sc.hasClients ? _sc.offset : 0.0;

  @override
  Widget build(BuildContext context) {
    final player = context.watch<PlayerState>();
    final top = MediaQuery.paddingOf(context).top;
    final width = MediaQuery.sizeOf(context).width;
    final insetSize = math.min(width * 0.68, 260.0);
    final heroH = top + 56 + insetSize + 28;
    _heroH = heroH;
    final saved = LibraryStore.instance.isAlbumSaved(widget.albumTitle, widget.artistName);
    final cover = _resolvedCover ??
        widget.coverUrl ??
        (_tracks.isNotEmpty
            ? _tracks.first.coverUrl
            : 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600');

    final reduce = MediaQuery.disableAnimationsOf(context);
    final active = TickerMode.valuesOf(context).enabled;
    if (reduce != _reduceMotion || active != _routeActive) {
      _reduceMotion = reduce;
      _routeActive = active;
      WidgetsBinding.instance.addPostFrameCallback((_) => _syncMotion());
    }

    if (_coverKey != cover) {
      _coverKey = cover;
      _extractTint(cover);
      _analyzeCover(cover);
    }

    final lower = widget.artistName.toLowerCase();
    final mine = _artistPool.where((t) => t.artist.toLowerCase().contains(lower));
    final theirs = _artistPool.where((t) => !t.artist.toLowerCase().contains(lower));
    final moreBy = _group(mine, skip: widget.albumTitle);
    final similar = _group(theirs);

    final title = _displayAlbumTitle;
    final artists = _albumArtists.isNotEmpty
        ? _albumArtists
        : MediaNormalizer.splitArtistNames(_displayArtistName);
    final heroSpace = top + 56 + insetSize + 18;

    return Scaffold(
      backgroundColor: AppColors.bg,
      body: TweenAnimationBuilder<Color?>(
        tween: ColorTween(end: _tint),
        duration: const Duration(milliseconds: 900),
        curve: Curves.easeOutCubic,
        builder: (context, c, _) {
          final base = Color.lerp(c ?? _tint, Colors.black, 0.32)!;
          return Stack(
            children: [
              _backdrop(base, heroH),
              _heroArt(base, top, heroH, insetSize, _hq(cover)),
              NotificationListener<ScrollNotification>(
                onNotification: _onScrollNote,
                child: CustomScrollView(
                controller: _sc,
                physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
                slivers: [
                  // ---------------- Hero text + actions ----------------
                  SliverToBoxAdapter(
                    child: Column(
                      children: [
                        TweenAnimationBuilder<double>(
                          tween: Tween(end: heroSpace),
                          duration: const Duration(milliseconds: 650),
                          curve: Curves.easeOutCubic,
                          builder: (context, v, child) => SizedBox(height: v),
                        ),
                        _Reveal(
                          delay: const Duration(milliseconds: 120),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 28),
                            child: Column(
                              children: [
                                Text(
                                  title,
                                  textAlign: TextAlign.center,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontSize: _titleSize(title),
                                    fontWeight: FontWeight.w700,
                                    letterSpacing: -0.6,
                                    height: 1.12,
                                  ),
                                ),
                                const SizedBox(height: 5),
                                _Press(
                                  scale: 0.95,
                                  onTap: () => _openArtist(),
                                  child: InteractiveArtistsText(
                                    artists: artists.length > 3 ? artists.take(3).toList() : artists,
                                    style: TextStyle(
                                      color: Colors.white.withValues(alpha: 0.88),
                                      fontSize: 18,
                                      fontWeight: FontWeight.w500,
                                      letterSpacing: -0.2,
                                    ),
                                    onTapArtist: (artist) => _openArtist(artist),
                                  ),
                                ),
                                const SizedBox(height: 5),
                                AnimatedSwitcher(
                                  duration: const Duration(milliseconds: 400),
                                  child: Text(
                                    _loading ? 'Album' : _metaLine,
                                    key: ValueKey('$_loading-$_metaLine'),
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w500,
                                      color: Colors.white.withValues(alpha: 0.6),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 18),

                        // Shuffle · Play · Add
                        _Reveal(
                          delay: const Duration(milliseconds: 220),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              _ActionCircle(
                                onTap: () => _play(0, shuffle: true),
                                child: const Icon(CupertinoIcons.shuffle, color: Colors.white, size: 20),
                              ),
                              const SizedBox(width: 12),
                              SizedBox(
                                width: 176,
                                child: _Press(
                                  scale: 0.95,
                                  onTap: () => _play(0),
                                  child: Container(
                                    height: 48,
                                    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(24)),
                                    alignment: Alignment.center,
                                    child: const Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Icon(CupertinoIcons.play_fill, color: Colors.black, size: 17),
                                        SizedBox(width: 7),
                                        Text('Play', style: TextStyle(color: Colors.black, fontSize: 17, fontWeight: FontWeight.w600)),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 12),
                              _ActionCircle(
                                active: saved,
                                onTap: () => _toggleSaved(cover),
                                child: AnimatedSwitcher(
                                  duration: const Duration(milliseconds: 450),
                                  switchInCurve: _spring,
                                  transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c),
                                  child: Icon(
                                    saved ? CupertinoIcons.checkmark : CupertinoIcons.plus,
                                    key: ValueKey(saved),
                                    size: 20,
                                    color: Colors.white,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),

                        // Editorial note (only when the album has one)
                        if (_description != null && _description!.isNotEmpty)
                          _Reveal(
                            delay: const Duration(milliseconds: 300),
                            child: Padding(
                              padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
                              child: GestureDetector(
                                behavior: HitTestBehavior.opaque,
                                onTap: () {
                                  HapticFeedback.selectionClick();
                                  setState(() => _expanded = !_expanded);
                                },
                                child: AnimatedSize(
                                  duration: const Duration(milliseconds: 450),
                                  curve: Curves.easeOutCubic,
                                  alignment: Alignment.topCenter,
                                  child: _expanded
                                      ? Align(
                                          alignment: Alignment.centerLeft,
                                          child: Text.rich(
                                            TextSpan(children: [
                                              TextSpan(text: '$_description '),
                                              const TextSpan(
                                                  text: 'LESS',
                                                  style: TextStyle(fontWeight: FontWeight.w700, color: Colors.white)),
                                            ]),
                                            style: TextStyle(color: Colors.white.withValues(alpha: 0.75), fontSize: 14, height: 1.35),
                                          ),
                                        )
                                      : Row(
                                          crossAxisAlignment: CrossAxisAlignment.end,
                                          children: [
                                            Expanded(
                                              child: Text(
                                                _description!,
                                                maxLines: 2,
                                                overflow: TextOverflow.ellipsis,
                                                style: TextStyle(color: Colors.white.withValues(alpha: 0.75), fontSize: 14, height: 1.35),
                                              ),
                                            ),
                                            const SizedBox(width: 10),
                                            const Text('MORE',
                                                style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w700)),
                                          ],
                                        ),
                                ),
                              ),
                            ),
                          ),
                        const SizedBox(height: 14),
                      ],
                    ),
                  ),

                  // ---------------- Tracklist + footer + shelves ----------------
                  SliverToBoxAdapter(
                    child: ColoredBox(
                      color: Colors.black,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                        Container(margin: const EdgeInsets.symmetric(horizontal: 20), height: 0.5, color: AppColors.hairline),
                        if (_loading)
                          const Padding(
                            padding: EdgeInsets.all(40),
                            child: Center(child: CupertinoActivityIndicator(color: Colors.white70, radius: 12)),
                          )
                        else if (_tracks.isEmpty)
                          const Padding(
                            padding: EdgeInsets.all(40),
                            child: Center(child: Text('No tracks found for this album.', style: TextStyle(color: AppColors.textSecondary))),
                          )
                        else ...[
                          for (var i = 0; i < _tracks.length; i++)
                            _Reveal(
                              delay: Duration(milliseconds: 30 * math.min(i, 8)),
                              rise: 14,
                              child: _TrackRow(
                                index: i,
                                track: _tracks[i],
                                showArtist: !_tracks[i].artist.toLowerCase().contains(lower),
                                current: player.currentTrack?.id == _tracks[i].id,
                                playing: player.currentTrack?.id == _tracks[i].id && player.isPlaying,
                                onTap: () => _play(i),
                              ),
                            ),
                          _Reveal(
                            delay: Duration(milliseconds: (30 * math.min(_tracks.length, 8) + 80).toInt()),
                            child: _Footer(
                              songsCount: _tracks.length,
                              duration: _footerDuration,
                              year: _releaseYear,
                              label: _recordLabel,
                            ),
                          ),
                        ],

                        if (moreBy.isNotEmpty) ...[
                          _Reveal(child: _SecHeader('More by ${widget.artistName}')),
                          _Reveal(child: _ReleaseShelf(items: moreBy, onTap: _openAlbum, label: 'Album')),
                        ],

                        if (similar.isNotEmpty) ...[
                          const _Reveal(child: _SecHeader('You might also like')),
                          _Reveal(child: _ReleaseShelf(items: similar, onTap: _openAlbum, showArtist: true)),
                        ],

                        const SizedBox(height: 140),
                      ],
                    ),
                  ),
                ),
                ],
              )),
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                child: DynamicIslandHeader(
                  title: title,
                  showBack: true,
                  scrollController: _sc,
                  revealOffset: heroSpace - 40,
                  onBack: () => Navigator.pop(context),
                  trailing: _Press(
                    scale: 0.88,
                    onTap: () => _showMore(saved, cover),
                    child: Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.45),
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white.withValues(alpha: 0.12), width: 0.8),
                      ),
                      alignment: Alignment.center,
                      child: const Icon(CupertinoIcons.ellipsis, color: Colors.white, size: 18),
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  /* ------------------------- hero layers ------------------------- */

  /// Tinted page background; moves 1:1 with the content (extra room above so
  /// bounce-overscroll never shows a gap) and slowly breathes.
  Widget _backdrop(Color base, double heroH) {
    const extra = 1200.0;
    final h = extra + heroH + 600;
    final stops = [0.0, (extra + heroH * 0.4) / h, (extra + heroH * 0.75) / h, 1.0];
    return Positioned(
      top: -extra,
      left: 0,
      right: 0,
      height: h,
      child: AnimatedBuilder(
        animation: Listenable.merge([_sc, _glow]),
        builder: (context, child) {
          final b = _breathe(base);
          return Transform.translate(
            offset: Offset(0, -_offset),
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [b, b.withValues(alpha: 0.6), Colors.black, Colors.black],
                  stops: stops,
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  /// Cover media: still image, with the optional video loop fading in over it.
  Widget _cover(String url, double radius) {
    final v = _video;
    return RepaintBoundary(
      child: Stack(
        fit: StackFit.expand,
        children: [
          _Img(url, radius: radius),
          if (_videoReady && v != null)
            TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: 1),
              duration: const Duration(milliseconds: 700),
              builder: (_, o, child) => Opacity(opacity: o, child: child),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(radius),
                child: FittedBox(
                  fit: BoxFit.cover,
                  clipBehavior: Clip.hardEdge,
                  child: SizedBox(
                    width: v.value.size.width,
                    height: v.value.size.height,
                    child: VideoPlayer(v),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  /// Inset square: 3D tilt (follows the phone), floating drift inside the
  /// frame and a glow behind it that breathes.
  Widget _insetArt(double top, double heroH, double size, String url) {
    final media = _cover(url, 0);
    return SizedBox(
      key: const ValueKey('inset'),
      height: heroH,
      width: double.infinity,
      child: Align(
        alignment: Alignment.topCenter,
        child: Padding(
          padding: EdgeInsets.only(top: top + 56),
          child: AnimatedBuilder(
            animation: Listenable.merge([_tilt, _glow]),
            builder: (context, child) {
              final t = _tilt.value;
              final b = Curves.easeInOut.transform(_glow.value);
              return Transform(
                alignment: Alignment.center,
                transform: Matrix4.identity()
                  ..setEntry(3, 2, 0.0011)
                  ..rotateX(-t.dy * 0.07)
                  ..rotateY(t.dx * 0.09),
                child: Container(
                  width: size,
                  height: size,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
                    boxShadow: [
                      BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 30, offset: const Offset(0, 16)),
                      BoxShadow(
                        color: _tint.withValues(alpha: 0.16 + 0.22 * b),
                        blurRadius: 50 + 30 * b,
                        spreadRadius: 2 + 6 * b,
                      ),
                    ],
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(14),
                    child: AnimatedBuilder(
                      animation: _live,
                      child: media,
                      builder: (_, child) {
                        final a = _live.value * math.pi;
                        final d = _driftOn;
                        return Transform.translate(
                          offset: Offset(d ? math.cos(a) * 3 : 0.0, d ? math.cos(2 * a) * 2 : 0.0),
                          child: child,
                        );
                      },
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  /// The cover layer. Scrolling gradually blurs it, pushes it back (parallax +
  /// soft zoom) and dissolves it into the tinted backdrop. Pulling down
  /// stretches it like iOS. Sharp covers go full-bleed, small ones inset.
  Widget _heroArt(Color base, double top, double heroH, double insetSize, String url) {
    final Widget art = AnimatedSwitcher(
      duration: const Duration(milliseconds: 600),
      switchInCurve: Curves.easeOutCubic,
      child: _insetArt(top, heroH, insetSize, url),
    );

    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      height: heroH,
      child: ClipRect(
        child: ColoredBox(
          color: Colors.black,
          child: AnimatedBuilder(
          animation: _sc,
          child: RepaintBoundary(child: art),
          builder: (_, child) {
            final o = _offset;
            final p = (o / (heroH * 0.7)).clamp(0.0, 1.0).toDouble();
            final e = Curves.easeInOut.transform(p);
            final sigma = e * 28;
            final over = o < 0 ? -o : 0.0;
            final scale = 1.0 + (over > 0 ? over / (heroH * 1.5) : 0.0);

            Widget w = child!;
            if (sigma > 0.4) {
              w = ImageFiltered(
                imageFilter: ui.ImageFilter.blur(sigmaX: sigma, sigmaY: sigma, tileMode: TileMode.clamp),
                child: w,
              );
            }
            w = Transform.scale(scale: scale, alignment: Alignment.topCenter, child: w);
            w = Transform.translate(offset: Offset(0, o > 0 ? -o * 0.45 : 0), child: w);

            // Smoothly cover with solid black on scroll-up so image never shows transparently behind content
            final blackCover = (o / 150.0).clamp(0.0, 1.0).toDouble();
            if (blackCover > 0.0) {
              w = Stack(
                fit: StackFit.expand,
                children: [
                  w,
                  ColoredBox(
                    color: Colors.black.withValues(alpha: blackCover),
                  ),
                ],
              );
            }
            return w;
          },
        ),
      ),
    ),
  );
}
}

/* ------------------------------------------------------------------ */
/*  Track Row (compact, Apple Music style)                              */
/* ------------------------------------------------------------------ */
class _TrackRow extends StatelessWidget {
  const _TrackRow({
    required this.index,
    required this.track,
    required this.current,
    required this.playing,
    required this.showArtist,
    required this.onTap,
  });

  final int index;
  final Track track;
  final bool current, playing, showArtist;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => _Press(
        scale: 0.985,
        onTap: onTap,
        child: SizedBox(
          height: showArtist ? 54 : 46,
          child: Stack(
            children: [
              Padding(
                padding: const EdgeInsets.only(left: 20, right: 10),
                child: Row(
                  children: [
                    SizedBox(
                      width: 30,
                      child: AnimatedSwitcher(
                        duration: const Duration(milliseconds: 350),
                        switchInCurve: _spring,
                        transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c),
                        child: current
                            ? Align(key: const ValueKey('eq'), alignment: Alignment.centerLeft, child: _Eq(playing: playing))
                            : Align(
                                key: const ValueKey('n'),
                                alignment: Alignment.centerLeft,
                                child: Text(
                                  '${index + 1}',
                                  style: const TextStyle(
                                    fontFamily: 'SF Pro',
                                    color: AppColors.textSecondary,
                                    fontSize: 14,
                                    fontWeight: FontWeight.w400,
                                    fontFeatures: [FontFeature.tabularFigures()],
                                  ),
                                ),
                              ),
                      ),
                    ),
                    Expanded(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          AnimatedDefaultTextStyle(
                            duration: const Duration(milliseconds: 250),
                            style: TextStyle(
                              fontFamily: 'SF Pro',
                              color: current ? AppColors.accent : Colors.white,
                              fontSize: 15,
                              fontWeight: FontWeight.w400,
                              letterSpacing: -0.2,
                            ),
                            child: Text(
                              MediaNormalizer.cleanCompactTitle(track.title),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          if (showArtist)
                            Text(
                              MediaNormalizer.formatArtists(track.artist),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontFamily: 'SF Pro',
                                color: AppColors.textSecondary,
                                fontSize: 12,
                                fontWeight: FontWeight.w400,
                              ),
                            ),
                        ],
                      ),
                    ),
                    _Press(
                      scale: 0.8,
                      onTap: () {
                        HapticFeedback.selectionClick();
                        ZenDropdown.showTrackMenu(context: context, track: track);
                      },
                      child: Padding(
                        padding: const EdgeInsets.all(8),
                        child: Icon(Icons.more_horiz_rounded, color: Colors.white.withValues(alpha: 0.6), size: 20),
                      ),
                    ),
                  ],
                ),
              ),
              Positioned(left: 50, right: 20, bottom: 0, child: Container(height: 0.5, color: AppColors.hairline)),
            ],
          ),
        ),
      );
}

/* ------------------------------------------------------------------ */
/*  Footer (minimal, only real data)                                    */
/* ------------------------------------------------------------------ */
class _Footer extends StatelessWidget {
  const _Footer({required this.songsCount, required this.duration, required this.year, required this.label});

  final int songsCount;
  final String duration;
  final int? year;
  final String? label;

  @override
  Widget build(BuildContext context) {
    const style = TextStyle(
      fontFamily: 'SF Pro',
      color: AppColors.textSecondary,
      fontSize: 12.5,
      fontWeight: FontWeight.w400,
      height: 1.5,
    );
    final hasYear = year != null && year! > 0;
    final hasLabel = label != null && label!.isNotEmpty;

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('$songsCount ${songsCount == 1 ? 'song' : 'songs'}${duration.isNotEmpty ? ', $duration' : ''}', style: style),
          if (hasYear) Text('Released $year', style: style),
          if (hasLabel) Text('℗ ${hasYear ? '$year ' : ''}$label', style: style),
        ],
      ),
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Horizontal shelf                                                    */
/* ------------------------------------------------------------------ */
class _ReleaseShelf extends StatelessWidget {
  const _ReleaseShelf({required this.items, required this.onTap, this.showArtist = false, this.label});
  final List<_Release> items;
  final void Function(_Release) onTap;
  final bool showArtist;
  final String? label;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 214,
        child: ListView.builder(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 20),
          physics: const _SnapPhysics(parent: BouncingScrollPhysics(), itemExtent: 164),
          itemExtent: 164,
          itemCount: items.length,
          itemBuilder: (_, i) {
            final r = items[i];
            return Padding(
              padding: const EdgeInsets.only(right: 14),
              child: _Press(
                onTap: () => onTap(r),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    AspectRatio(
                      aspectRatio: 1,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(10),
                          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.28), blurRadius: 10, offset: const Offset(0, 4))],
                        ),
                        child: _Img(r.cover),
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(r.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600, letterSpacing: -0.15)),
                    const SizedBox(height: 2),
                    Text(showArtist ? r.artist : (r.count < 3 ? 'Single' : (label ?? 'Album')),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
                  ],
                ),
              ),
            );
          },
        ),
      );
}

