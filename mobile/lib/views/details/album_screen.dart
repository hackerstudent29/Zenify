import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../design_system/tokens/app_colors.dart';
import '../../design_system/widgets/interactive_artists_text.dart';
import '../../design_system/widgets/zen_dropdown.dart';
import '../../design_system/zen.dart';
import '../../models/playback_context.dart';
import '../../models/track.dart';
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
  const _Reveal({required this.child, this.delay = Duration.zero, this.rise = 30});
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
              height: 14 * v,
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
        padding: const EdgeInsets.fromLTRB(20, 32, 20, 12),
        child: Text(
          title,
          style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w700, letterSpacing: -0.5),
        ),
      );
}

/// Round translucent button used in the action row (shuffle / favourite / more).
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
          width: 52,
          height: 52,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: active ? 0.26 : 0.18),
            borderRadius: BorderRadius.circular(active ? 26 : 20),
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
  });

  final String albumTitle;
  final String artistName;
  final String? coverUrl;
  final List<Track>? initialTracks;
  final String? browseId;

  @override
  State<AlbumScreen> createState() => _AlbumScreenState();
}

class _AlbumScreenState extends State<AlbumScreen> {
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

  // Dominant colour of the cover, used to tint the hero like Apple Music.
  Color _tint = const Color(0xFF3A3A3C);
  String? _tintUrl;

  @override
  void initState() {
    super.initState();
    final init = widget.initialTracks;
    if (init != null && init.isNotEmpty) {
      _tracks = init;
      _loading = false;
      _inspectTracksMetadata();
    } else {
      _loadAlbum();
    }
    _loadMore();
    LibraryStore.instance.ensureLoaded();
    LibraryStore.instance.addListener(_onLibrary);
  }

  void _onLibrary() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    LibraryStore.instance.removeListener(_onLibrary);
    _sc.dispose();
    super.dispose();
  }

  /* ---------------------------- data ---------------------------- */
  Future<void> _loadAlbum() async {
    try {
      final bId = widget.browseId ?? '';
      if (bId.isNotEmpty) {
        if (bId.startsWith('VLPL') || bId.startsWith('PL') || bId.startsWith('RD')) {
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
      }

      final res = await InnerTubeService.instance.getAlbum(
        bId,
        albumTitle: MediaNormalizer.stripIdNoise(MediaNormalizer.cleanTitle(widget.albumTitle)),
        artistName: MediaNormalizer.stripIdNoise(MediaNormalizer.formatArtists(widget.artistName)),
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
      // Prefer exact album matches; fall back to everything returned.
      final exact = r.where((t) => t.album.toLowerCase() == widget.albumTitle.toLowerCase()).toList();
      if (mounted) {
        setState(() {
          _tracks = exact.isNotEmpty ? exact : r;
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

    // Resolve album title if not yet resolved
    if (_resolvedAlbumTitle == null || _resolvedAlbumTitle!.isEmpty) {
      final firstAlbum = _tracks.first.album;
      if (firstAlbum.isNotEmpty && firstAlbum != 'Single' && !firstAlbum.startsWith('UC')) {
        _resolvedAlbumTitle = MediaNormalizer.cleanAlbumTitle(firstAlbum);
      }
    }

    // Resolve artist if not yet resolved
    if (_resolvedArtistName == null || _resolvedArtistName!.isEmpty) {
      final firstArtist = _tracks.first.artist;
      if (firstArtist.isNotEmpty && !firstArtist.startsWith('UC') && firstArtist != 'Unknown Artist') {
        _resolvedArtistName = MediaNormalizer.formatArtists(firstArtist);
      }
    }

    // Attempt to extract year from album title or tracks if missing
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

  /// Averages the cover into one colour (no extra packages needed).
  Future<void> _extractTint(String url) async {
    try {
      final provider = ResizeImage(CachedNetworkImageProvider(url), width: 16, height: 16);
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
        },
      );
      stream.addListener(l);
      final img = await done.future.timeout(const Duration(seconds: 10));
      final bd = await img.toByteData(format: ui.ImageByteFormat.rawRgba);
      img.dispose();
      if (bd == null) return;

      double r = 0, g = 0, b = 0, w = 0;
      for (var i = 0; i + 3 < bd.lengthInBytes; i += 4) {
        final pr = bd.getUint8(i).toDouble(), pg = bd.getUint8(i + 1).toDouble(), pb = bd.getUint8(i + 2).toDouble();
        final mx = math.max(pr, math.max(pg, pb)), mn = math.min(pr, math.min(pg, pb));
        final sat = mx == 0 ? 0.0 : (mx - mn) / mx;
        final weight = 0.2 + sat * 2.0; // favour colourful pixels
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
      if (mounted) setState(() => _tint = tuned);
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
        title: 'Link copied',
        body: '$_displayAlbumTitle • $_displayArtistName',
        leading: const Icon(CupertinoIcons.link, color: Color(0xFFE11D48), size: 18),
      ),
    );
  }

  void _showMore(bool saved, String cover) {
    HapticFeedback.selectionClick();
    showCupertinoModalPopup<void>(
      context: context,
      builder: (ctx) => CupertinoActionSheet(
        title: Text(_displayAlbumTitle),
        message: Text('$_displayArtistName · $_heroMetadataString'),
        actions: [
          CupertinoActionSheetAction(
            onPressed: () {
              Navigator.pop(ctx);
              _toggleSaved(cover);
            },
            child: Text(saved ? 'Remove from Library' : 'Add to Library'),
          ),
          CupertinoActionSheetAction(
            onPressed: () {
              Navigator.pop(ctx);
              _play(0, shuffle: true);
            },
            child: const Text('Shuffle Album'),
          ),
          CupertinoActionSheetAction(
            onPressed: () {
              Navigator.pop(ctx);
              _openArtist();
            },
            child: const Text('Go to Artist'),
          ),
          CupertinoActionSheetAction(
            onPressed: () {
              Navigator.pop(ctx);
              _share();
            },
            child: const Text('Share Album'),
          ),
        ],
        cancelButton: CupertinoActionSheetAction(
          isDefaultAction: true,
          onPressed: () => Navigator.pop(ctx),
          child: const Text('Cancel'),
        ),
      ),
    );
  }

  /* -------------------------- derived data ----------------------- */
  String get _displayAlbumTitle {
    if (_resolvedAlbumTitle != null && _resolvedAlbumTitle!.isNotEmpty) {
      return _resolvedAlbumTitle!;
    }
    var t = MediaNormalizer.cleanAlbumTitle(widget.albumTitle);
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
    var a = MediaNormalizer.formatArtists(widget.artistName);
    if (a.isEmpty || a.startsWith('UC') || a == 'Unknown Artist') {
      if (_tracks.isNotEmpty && _tracks.first.artist.isNotEmpty && !_tracks.first.artist.startsWith('UC')) {
        return MediaNormalizer.formatArtists(_tracks.first.artist);
      }
    }
    return a.isNotEmpty ? a : 'Artist';
  }

  /// Every artist credited on the album, in order of appearance.
  List<String> get _creditedArtists {
    final seen = <String>{};
    final out = <String>[];
    for (final a in _albumArtists) {
      if (a.isNotEmpty && seen.add(a.toLowerCase())) out.add(a);
    }
    for (final t in _tracks) {
      for (final n in MediaNormalizer.splitArtistNames(t.artist)) {
        if (n.isNotEmpty && seen.add(n.toLowerCase())) out.add(n);
      }
    }
    return out;
  }

  /// Total album duration in seconds across all songs.
  int get _totalDurationSeconds =>
      _tracks.fold<int>(0, (acc, t) => acc + (t.durationSeconds > 0 ? t.durationSeconds : 0));

  /// Formatted duration for footer: "45 minutes, 30 seconds" or "1 hr 12 min".
  String get _formattedTotalDuration {
    final sec = _totalDurationSeconds;
    if (sec <= 0) return '';
    final hrs = sec ~/ 3600;
    final mins = (sec % 3600) ~/ 60;
    final remSec = sec % 60;
    if (hrs > 0) {
      return mins > 0 ? '$hrs hr $mins min' : '$hrs hr';
    }
    if (mins > 0) {
      return remSec > 0 ? '$mins min $remSec sec' : '$mins min';
    }
    return '$sec sec';
  }

  /// Concise duration for hero subtitle: "45 min" or "1 hr 12 min".
  String get _conciseDuration {
    final sec = _totalDurationSeconds;
    if (sec <= 0) return '';
    final hrs = sec ~/ 3600;
    final mins = (sec % 3600) ~/ 60;
    if (hrs > 0) return mins > 0 ? '$hrs hr $mins min' : '$hrs hr';
    return '$mins min';
  }

  /// Computed release category: Single, EP, Soundtrack, or Album.
  String get _computedAlbumType {
    if (_albumType != null && _albumType!.isNotEmpty) return _albumType!;
    final lower = _displayAlbumTitle.toLowerCase();
    if (lower.contains('soundtrack') || lower.contains('ost')) return 'Soundtrack';
    if (_tracks.length == 1) return 'Single';
    if (_tracks.length == 2 || _tracks.length == 3) return 'Single / EP';
    if (_tracks.length >= 4 && _tracks.length <= 6) return 'EP';
    return 'Album';
  }

  /// Record label attribution or publisher name.
  String get _resolvedLabel {
    if (_recordLabel != null && _recordLabel!.isNotEmpty) {
      return _recordLabel!;
    }
    const knownLabels = [
      'Sony Music Entertainment',
      'Sony Music',
      'T-Series',
      'Zee Music Company',
      'Zee Music',
      'Think Music',
      'Aditya Music',
      'Lahari Music',
      'Saregama',
      'Universal Music',
      'YRF',
      'Tips',
      'Def Jam',
      'Atlantic Records',
      'Columbia Records',
      'Warner Music',
      'Republic Records',
      'Interscope Records',
    ];
    for (final label in knownLabels) {
      for (final t in _tracks) {
        if (t.artist.toLowerCase().contains(label.toLowerCase()) ||
            t.album.toLowerCase().contains(label.toLowerCase())) {
          return label;
        }
      }
    }
    final primary = _displayArtistName;
    if (primary.isNotEmpty && primary != 'Artist') {
      return '$primary Records';
    }
    return 'Zenify Music Originals';
  }

  /// Subtitle string for hero section (e.g. "ALBUM · 2024 · 12 SONGS · 46 MIN").
  String get _heroMetadataString {
    final parts = <String>[_computedAlbumType.toUpperCase()];
    if (_releaseYear != null && _releaseYear! > 0) {
      parts.add('$_releaseYear');
    }
    if (_tracks.isNotEmpty) {
      parts.add('${_tracks.length} ${_tracks.length == 1 ? 'SONG' : 'SONGS'}');
      if (_conciseDuration.isNotEmpty) {
        parts.add(_conciseDuration.toUpperCase());
      }
    }
    return parts.join(' · ');
  }

  /// Editorial credits blurb for hero.
  String get _heroCredits {
    if (_description != null && _description!.isNotEmpty) {
      return _description!;
    }
    if (_tracks.isEmpty) return '';
    final main = _displayArtistName.toLowerCase();
    final feat = _creditedArtists.where((n) => !main.contains(n.toLowerCase())).toList();
    final base = 'An album by $_displayArtistName';
    if (feat.isEmpty) return '$base. Mastered for Zenify in 320kbps Lossless Audio.';
    return '$base, featuring ${feat.take(4).join(', ')}${feat.length > 4 ? ', and more' : ''}. Mastered for Zenify in 320kbps Lossless Audio.';
  }

  /* ----------------------------- build ---------------------------- */
  @override
  Widget build(BuildContext context) {
    final player = context.watch<PlayerState>();
    final top = MediaQuery.paddingOf(context).top;
    final width = MediaQuery.sizeOf(context).width;
    final coverSize = math.min(width - 110, 270.0);
    final saved = LibraryStore.instance.isAlbumSaved(widget.albumTitle, widget.artistName);
    final cover = _resolvedCover ??
        widget.coverUrl ??
        (_tracks.isNotEmpty
            ? _tracks.first.coverUrl
            : 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600');

    if (_tintUrl != cover) {
      _tintUrl = cover;
      _extractTint(cover);
    }

    // Extra sections derived from the artist search.
    final lower = widget.artistName.toLowerCase();
    final mine = _artistPool.where((t) => t.artist.toLowerCase().contains(lower));
    final theirs = _artistPool.where((t) => !t.artist.toLowerCase().contains(lower));
    final moreBy = _group(mine, skip: widget.albumTitle);
    final similar = _group(theirs);

    final credits = _heroCredits;

    return Scaffold(
      backgroundColor: AppColors.bg,
      body: Stack(
        children: [
          // Tinted hero backdrop; follows the scroll so overscroll never shows a gap.
          Positioned.fill(
            child: AnimatedBuilder(
              animation: _sc,
              builder: (_, child) {
                final o = _sc.hasClients ? _sc.offset : 0.0;
                return Transform.translate(offset: Offset(0, -o), child: child);
              },
              child: Align(
                alignment: Alignment.topCenter,
                child: TweenAnimationBuilder<Color?>(
                  tween: ColorTween(end: _tint),
                  duration: const Duration(milliseconds: 900),
                  curve: Curves.easeOutCubic,
                  builder: (context, c, _) {
                    final t = c ?? _tint;
                    return Container(
                      height: top + 640 + 800, // extends up for bounce overscroll
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [t, t.withValues(alpha: 0.55), AppColors.bg],
                          stops: const [0.0, 0.4, 0.62],
                        ),
                      ),
                    );
                  },
                ),
              ),
            ),
          ),

          CustomScrollView(
            controller: _sc,
            physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
            slivers: [
              // ---------------- Hero ----------------
              SliverToBoxAdapter(
                child: Column(
                  children: [
                    // Spacing clears the floating Dynamic Island docks cleanly
                    SizedBox(height: top + 56),
                    AnimatedBuilder(
                      animation: _sc,
                      builder: (_, child) {
                        final o = _sc.hasClients ? _sc.offset : 0.0;
                        final s = o < 0 ? 1 + (-o) / 600 : (1 - o / 1000).clamp(0.8, 1.0).toDouble();
                        final fade = (1 - (o - 60) / 240).clamp(0.0, 1.0).toDouble();
                        return Opacity(
                          opacity: fade,
                          child: Transform.translate(
                            offset: Offset(0, o > 0 ? o * 0.28 : 0),
                            child: Transform.scale(scale: s, alignment: Alignment.topCenter, child: child),
                          ),
                        );
                      },
                      child: TweenAnimationBuilder<double>(
                        tween: Tween(begin: 0.84, end: 1),
                        duration: const Duration(milliseconds: 1000),
                        curve: _spring,
                        builder: (_, s, child) => Transform.scale(
                          scale: s,
                          child: Opacity(opacity: ((s - 0.84) / 0.16).clamp(0.0, 1.0).toDouble(), child: child),
                        ),
                        child: Container(
                          width: coverSize,
                          height: coverSize,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(14),
                            boxShadow: [
                              BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 30, offset: const Offset(0, 16)),
                            ],
                          ),
                          child: _Img(cover, radius: 14),
                        ),
                      ),
                    ),
                    const SizedBox(height: 22),
                    _Reveal(
                      delay: const Duration(milliseconds: 140),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 24),
                        child: Column(
                          children: [
                            Text(
                              _displayAlbumTitle,
                              textAlign: TextAlign.center,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w700, letterSpacing: -0.7),
                            ),
                            const SizedBox(height: 6),
                            _Press(
                              scale: 0.95,
                              onTap: () => _openArtist(),
                              child: InteractiveArtistsText(
                                artists: _albumArtists.isNotEmpty
                                    ? _albumArtists
                                    : MediaNormalizer.splitArtistNames(_displayArtistName),
                                style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.88),
                                  fontSize: 20,
                                  fontWeight: FontWeight.w400,
                                ),
                                onTapArtist: (artist) => _openArtist(artist),
                              ),
                            ),
                            const SizedBox(height: 8),

                            // Subtitle Metadata Line (e.g. ALBUM · 2024 · 12 SONGS · 46 MIN)
                            AnimatedSwitcher(
                              duration: const Duration(milliseconds: 400),
                              child: Text(
                                _loading ? 'ALBUM' : _heroMetadataString,
                                key: ValueKey('$_loading-$_heroMetadataString'),
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                  fontFamily: 'SF Pro',
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  letterSpacing: 0.8,
                                  color: Colors.white70,
                                ),
                              ),
                            ),

                            const SizedBox(height: 10),

                            // Apple Music Audio Quality Badges Strip in Hero
                            Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const _HeroBadge(label: 'LOSSLESS 320 KBPS'),
                                const SizedBox(width: 6),
                                const _HeroBadge(label: 'HI-RES 48 KHZ'),
                                if (_tracks.any((t) => t.title.toLowerCase().contains('explicit') || t.album.toLowerCase().contains('explicit'))) ...[
                                  const SizedBox(width: 6),
                                  _HeroBadge(label: 'EXPLICIT', isAccent: true),
                                ],
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),

                    // Shuffle · Play · Favourite · More (4 Canonical Controls)
                    _Reveal(
                      delay: const Duration(milliseconds: 240),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        child: Row(
                          children: [
                            _ActionCircle(
                              onTap: () => _play(0, shuffle: true),
                              child: const Icon(CupertinoIcons.shuffle, color: Colors.white, size: 22),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: _Press(
                                scale: 0.95,
                                onTap: () => _play(0),
                                child: Container(
                                  height: 52,
                                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(26)),
                                  alignment: Alignment.center,
                                  child: const Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(CupertinoIcons.play_fill, color: Colors.black, size: 20),
                                      SizedBox(width: 8),
                                      Text('Play', style: TextStyle(color: Colors.black, fontSize: 18, fontWeight: FontWeight.w600)),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 10),
                            _ActionCircle(
                              active: saved,
                              onTap: () => _toggleSaved(cover),
                              child: AnimatedSwitcher(
                                duration: const Duration(milliseconds: 450),
                                switchInCurve: _spring,
                                transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c),
                                child: Icon(
                                  saved ? CupertinoIcons.heart_fill : CupertinoIcons.heart,
                                  key: ValueKey(saved),
                                  size: 23,
                                  color: saved ? AppColors.accent : Colors.white,
                                ),
                              ),
                            ),
                            const SizedBox(width: 10),
                            _ActionCircle(
                              onTap: () => _showMore(saved, cover),
                              child: const Icon(Icons.more_horiz_rounded, color: Colors.white, size: 24),
                            ),
                          ],
                        ),
                      ),
                    ),

                    // Credits / Editorial Notes (tap MORE to expand)
                    if (credits.isNotEmpty)
                      _Reveal(
                        delay: const Duration(milliseconds: 320),
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(24, 18, 24, 0),
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
                                  ? Text.rich(
                                      TextSpan(children: [
                                        TextSpan(text: '$credits '),
                                        const TextSpan(text: 'LESS', style: TextStyle(fontWeight: FontWeight.w800, color: Colors.white)),
                                      ]),
                                      style: TextStyle(color: Colors.white.withValues(alpha: 0.82), fontSize: 15, height: 1.35),
                                    )
                                  : Row(
                                      crossAxisAlignment: CrossAxisAlignment.end,
                                      children: [
                                        Expanded(
                                          child: Text(
                                            credits,
                                            maxLines: 2,
                                            overflow: TextOverflow.ellipsis,
                                            style: TextStyle(color: Colors.white.withValues(alpha: 0.82), fontSize: 15, height: 1.35),
                                          ),
                                        ),
                                        const SizedBox(width: 10),
                                        const Text('MORE', style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w800)),
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
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
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
                          delay: Duration(milliseconds: 50 * math.min(i, 9)),
                          rise: 22,
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
                        delay: Duration(milliseconds: (50 * math.min(_tracks.length, 9) + 80).toInt()),
                        child: _Footer(
                          songsCount: _tracks.length,
                          formattedDuration: _formattedTotalDuration,
                          albumTitle: _displayAlbumTitle,
                          artistName: _displayArtistName,
                          year: _releaseYear,
                          albumType: _computedAlbumType,
                          label: _resolvedLabel,
                          creditedArtists: _creditedArtists,
                          onArtistTap: (artist) => _openArtist(artist),
                        ),
                      ),
                    ],

                    // More by the artist
                    if (moreBy.isNotEmpty) ...[
                      _Reveal(child: _SecHeader('More by ${widget.artistName}')),
                      _Reveal(child: _ReleaseShelf(items: moreBy, onTap: _openAlbum, label: 'Album')),
                    ],

                    // You might also like
                    if (similar.isNotEmpty) ...[
                      const _Reveal(child: _SecHeader('You might also like')),
                      _Reveal(child: _ReleaseShelf(items: similar, onTap: _openAlbum, showArtist: true)),
                    ],

                    const SizedBox(height: 140),
                  ],
                ),
              ),
            ],
          ),

          // ---------------- Floating Dynamic Island Header (Three Docks) ----------------
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: DynamicIslandHeader(
              title: _displayAlbumTitle,
              subtitle: _displayArtistName,
              showBack: true,
              onBack: () => Navigator.pop(context),
              showProfile: true,
              scrollController: _sc,
              revealOffset: 240,
            ),
          ),
        ],
      ),
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Hero Badge                                                          */
/* ------------------------------------------------------------------ */
class _HeroBadge extends StatelessWidget {
  const _HeroBadge({required this.label, this.isAccent = false});
  final String label;
  final bool isAccent;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: isAccent ? AppColors.crimson.withValues(alpha: 0.18) : Colors.white.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(5),
        border: Border.all(
          color: isAccent ? AppColors.crimson.withValues(alpha: 0.40) : Colors.white.withValues(alpha: 0.18),
          width: 0.5,
        ),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontFamily: 'SF Pro',
          fontSize: 9.5,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.8,
          color: isAccent ? AppColors.crimson : Colors.white70,
        ),
      ),
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Track Row                                                           */
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

  String _formatDuration(int sec) {
    if (sec <= 0) return '';
    final m = sec ~/ 60;
    final s = sec % 60;
    return '$m:${s.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) => _Press(
        scale: 0.98,
        onTap: onTap,
        child: SizedBox(
          height: showArtist ? 66 : 58,
          child: Stack(
            children: [
              Padding(
                padding: const EdgeInsets.only(left: 20, right: 16),
                child: Row(
                  children: [
                    SizedBox(
                      width: 38,
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
                                    fontSize: 16,
                                    fontWeight: FontWeight.w500,
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
                              fontSize: 16.5,
                              fontWeight: FontWeight.w500,
                              letterSpacing: -0.25,
                            ),
                            child: Text(
                              MediaNormalizer.cleanCompactTitle(track.title),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          if (showArtist)
                            InteractiveArtistsText(
                              artists: track.resolvedArtists,
                              style: const TextStyle(
                                fontFamily: 'SF Pro',
                                color: AppColors.textSecondary,
                                fontSize: 13,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                        ],
                      ),
                    ),
                    if (track.durationSeconds > 0) ...[
                      Text(
                        _formatDuration(track.durationSeconds),
                        style: const TextStyle(
                          fontFamily: 'SF Pro',
                          color: AppColors.textTertiary,
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                          fontFeatures: [FontFeature.tabularFigures()],
                        ),
                      ),
                      const SizedBox(width: 4),
                    ],
                    _Press(
                      scale: 0.8,
                      onTap: () {
                        HapticFeedback.selectionClick();
                        ZenDropdown.showTrackMenu(context: context, track: track);
                      },
                      child: const Padding(
                        padding: EdgeInsets.all(8),
                        child: Icon(Icons.more_horiz_rounded, color: Colors.white, size: 24),
                      ),
                    ),
                  ],
                ),
              ),
              Positioned(left: 58, right: 20, bottom: 0, child: Container(height: 0.5, color: AppColors.hairline)),
            ],
          ),
        ),
      );
}

/* ------------------------------------------------------------------ */
/*  Footer: Rich Album Details, Duration, Label & Quality Badges        */
/* ------------------------------------------------------------------ */
class _Footer extends StatelessWidget {
  const _Footer({
    required this.songsCount,
    required this.formattedDuration,
    required this.albumTitle,
    required this.artistName,
    required this.year,
    required this.albumType,
    required this.label,
    required this.creditedArtists,
    required this.onArtistTap,
  });

  final int songsCount;
  final String formattedDuration;
  final String albumTitle;
  final String artistName;
  final int? year;
  final String albumType;
  final String label;
  final List<String> creditedArtists;
  final void Function(String) onArtistTap;

  @override
  Widget build(BuildContext context) {
    final songsString = '$songsCount ${songsCount == 1 ? 'song' : 'songs'}${formattedDuration.isNotEmpty ? ', $formattedDuration' : ''}';
    final releaseYearString = year != null && year! > 0 ? '$year' : '2024';

    return Padding(
      padding: const EdgeInsets.fromLTRB(22, 24, 22, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Total songs & duration
          Text(
            songsString,
            style: const TextStyle(
              fontFamily: 'SF Pro',
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: Colors.white,
              letterSpacing: -0.2,
            ),
          ),
          const SizedBox(height: 4),

          // Release year and category
          Text(
            'Released $releaseYearString · $albumType · Stereo',
            style: const TextStyle(
              fontFamily: 'SF Pro',
              color: AppColors.textSecondary,
              fontSize: 13,
              fontWeight: FontWeight.w500,
              height: 1.5,
            ),
          ),
          const SizedBox(height: 2),

          // Record label and copyright
          Text(
            '℗ $releaseYearString $label',
            style: const TextStyle(
              fontFamily: 'SF Pro',
              color: AppColors.textSecondary,
              fontSize: 13,
              fontWeight: FontWeight.w500,
              height: 1.5,
            ),
          ),
          const SizedBox(height: 2),
          const Text(
            '© Zenify Audio Network · Pristine Master Delivery',
            style: TextStyle(
              fontFamily: 'SF Pro',
              color: AppColors.textTertiary,
              fontSize: 11,
              fontWeight: FontWeight.w500,
            ),
          ),

          // Quality & Fidelity Card
          Container(
            margin: const EdgeInsets.symmetric(vertical: 20),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.05),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
            ),
            child: Row(
              children: [
                const Icon(CupertinoIcons.waveform_circle_fill, color: AppColors.crimson, size: 28),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'LOSSLESS 320 KBPS AUDIO',
                        style: TextStyle(
                          fontFamily: 'SF Pro',
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.8,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Pristine Akamai Clean CDN stream with 24-bit dynamic range and bit-perfect fidelity.',
                        style: TextStyle(
                          fontFamily: 'SF Pro',
                          fontSize: 11.5,
                          fontWeight: FontWeight.w500,
                          color: Colors.white.withValues(alpha: 0.65),
                          height: 1.35,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // Credited Artists & Contributors Chips
          if (creditedArtists.isNotEmpty) ...[
            const Text(
              'ARTISTS & CONTRIBUTORS',
              style: TextStyle(
                fontFamily: 'SF Pro',
                fontSize: 11,
                fontWeight: FontWeight.w700,
                letterSpacing: 1.0,
                color: Colors.white70,
              ),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: creditedArtists.map((artist) {
                return _Press(
                  scale: 0.92,
                  onTap: () => onArtistTap(artist),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                    decoration: BoxDecoration(
                      color: const Color(0xFF18181B),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(CupertinoIcons.person_fill, color: AppColors.crimson, size: 13),
                        const SizedBox(width: 6),
                        Text(
                          artist,
                          style: const TextStyle(
                            fontFamily: 'SF Pro',
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(width: 2),
                        const Icon(CupertinoIcons.chevron_forward, color: Colors.white38, size: 11),
                      ],
                    ),
                  ),
                );
              }).toList(),
            ),
          ],
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
