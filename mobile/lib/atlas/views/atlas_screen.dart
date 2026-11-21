import 'package:flutter/cupertino.dart';

import '../../design_system/motion/zen_page_route.dart';
import '../core/atlas_tokens.dart';
import '../core/haptics.dart';
import '../data/atlas_music_source.dart';
import '../data/atlas_repository.dart';
import '../globe/globe_controller.dart';
import '../globe/globe_view.dart';
import '../models/atlas_models.dart';
import '../services/atlas_actions.dart';
import '../services/passport_store.dart';
import '../widgets/atlas_components.dart';
import '../widgets/atlas_press.dart';
import '../widgets/glass.dart';
import '../widgets/spring_in.dart';
import 'city_popup.dart';
import 'city_screen.dart';
import 'country_popup.dart';
import 'country_screen.dart';
import 'journey_detail_screen.dart';
import 'passport_screen.dart';
import 'search_sheet.dart';

/// Sound Atlas. The globe is a fixed stage; shelves live in a draggable
/// bottom sheet (Apple Maps / Music style), so globe gestures never fight
/// page scrolling and the globe is never re-laid-out while scrolling.
class AtlasScreen extends StatefulWidget {
  const AtlasScreen({super.key});

  @override
  State<AtlasScreen> createState() => _AtlasScreenState();
}

class _AtlasScreenState extends State<AtlasScreen>
    with TickerProviderStateMixin {
  static const double _minFrac = 0.36;
  static const double _maxFrac = 0.94;

  AtlasData? _data;
  GlobeController? _ctrl;
  List<AtlasCountry> _trending = const [];
  List<AtlasCity> _topCities = const [];
  final _popup = ValueNotifier<Object?>(null); // AtlasCity | AtlasCountry
  final _sheet = DraggableScrollableController();
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    PassportStore.instance.load();
    AtlasRepository.instance.load().then((d) {
      if (!mounted) return;
      setState(() {
        _data = d;
        _trending = d.countries.where((c) => c.hasCharts).take(16).toList();
        _topCities = d.cities.where((c) => c.tier == 1).toList();
        _ctrl = GlobeController(
          vsync: this,
          cities: d.cities,
          countries: d.countries,
        );
      });
    });
  }

  @override
  void dispose() {
    _popup.dispose();
    _sheet.dispose();
    _ctrl?.dispose();
    super.dispose();
  }

  // ───────── Interaction ─────────

  void _peekGlobe() {
    if (_sheet.isAttached && _sheet.size > _minFrac + 0.02) {
      _sheet.animateTo(
        _minFrac,
        duration: const Duration(milliseconds: 480),
        curve: Curves.easeOutCubic,
      );
    }
  }

  void _onGlobeTap(Offset p) {
    final hits = _ctrl?.hitTestAll(p);
    if (hits == null) return;
    if (hits.city != null) {
      _openCityPopup(hits.city!);
    } else if (hits.country != null) {
      _openCountryPopup(hits.country!);
    } else {
      _dismissPopups();
    }
  }

  Future<void> _openCityPopup(AtlasCity city) async {
    final ctrl = _ctrl;
    if (ctrl == null || _busy || _popup.value == city) return;
    _busy = true;
    H.select();
    _popup.value = null;
    _peekGlobe();
    ctrl.selectCity(city);
    await ctrl.flyToCity(city);
    _busy = false;
    if (!mounted || ctrl.selectedCity != city) return;
    _popup.value = city;
  }

  Future<void> _openCountryPopup(AtlasCountry country) async {
    final ctrl = _ctrl;
    if (ctrl == null || _busy || _popup.value == country) return;
    _busy = true;
    H.select();
    _popup.value = null;
    _peekGlobe();
    ctrl.selectCountry(country);
    await ctrl.flyToCountry(country);
    _busy = false;
    if (!mounted || ctrl.selectedCountry != country) return;
    _popup.value = country;
  }

  void _dismissPopups() {
    final ctrl = _ctrl;
    if (_popup.value == null && ctrl?.selected == null) return;
    _popup.value = null;
    ctrl?.clearSelection();
  }

  void _push(Widget page) =>
      Navigator.of(context).push(ZenPageRoute(builder: (_) => page));

  Future<void> _search() async {
    final data = _data;
    if (data == null) return;
    H.tap();
    final res = await showAtlasSearch(context, data);
    if (res == null || !mounted) return;
    if (res.city != null) {
      _openCityPopup(res.city!);
    } else if (res.country != null) {
      _openCountryPopup(res.country!);
    } else if (res.journey != null) {
      _push(JourneyDetailScreen(journey: res.journey!));
    }
  }

  void _openPassport() {
    final data = _data;
    if (data == null) return;
    H.tap();
    Navigator.of(context).push(
      ZenPageRoute(
        builder: (ctx) => PassportScreen(
          data: data,
          onSelect: (city) {
            Navigator.of(ctx).pop();
            _openCityPopup(city);
          },
        ),
      ),
    );
  }

  void _zoom(VoidCallback fn) {
    _popup.value = null;
    fn();
  }

  // ───────── Build ─────────

  @override
  Widget build(BuildContext context) {
    final data = _data;
    final ctrl = _ctrl;
    if (data == null || ctrl == null) {
      return const ColoredBox(
        color: AtlasColors.bg,
        child: Center(child: CupertinoActivityIndicator()),
      );
    }
    final pad = MediaQuery.paddingOf(context);

    return ColoredBox(
      color: AtlasColors.bg,
      child: LayoutBuilder(
        builder: (context, box) {
          final h = box.maxHeight;
          final globeTop = pad.top + 64;
          return Stack(
            children: [
              // Globe stage
              Positioned(
                left: 0,
                right: 0,
                top: globeTop,
                bottom: h * _minFrac - 20,
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Positioned.fill(
                      child: GlobeView(
                        controller: ctrl,
                        countries: data.countries,
                        onTap: _onGlobeTap,
                        onInteractionStart: _dismissPopups,
                      ),
                    ),
                    Positioned(
                      right: 16,
                      bottom: 34,
                      child: _ZoomPill(
                        onIn: () => _zoom(ctrl.zoomIn),
                        onOut: () => _zoom(ctrl.zoomOut),
                        onReset: () => _zoom(ctrl.resetCamera),
                      ),
                    ),
                    Positioned.fill(child: _popupLayer(ctrl, data)),
                  ],
                ),
              ),

              // Header
              Positioned(
                left: 20,
                right: 20,
                top: pad.top + 8,
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Sound Atlas',
                            style: AtlasText.largeTitle,
                          ),
                          Text(
                            '${data.countryCount} countries · ${data.cityCount} cities',
                            style: AtlasText.footnote,
                          ),
                        ],
                      ),
                    ),
                    GlassIconButton(
                      icon: CupertinoIcons.search,
                      onTap: _search,
                    ),
                    const SizedBox(width: 10),
                    GlassIconButton(
                      icon: CupertinoIcons.person_crop_circle,
                      onTap: _openPassport,
                    ),
                  ],
                ),
              ),

              // Shelves sheet
              DraggableScrollableSheet(
                controller: _sheet,
                initialChildSize: _minFrac,
                minChildSize: _minFrac,
                maxChildSize: _maxFrac,
                snap: true,
                snapSizes: const [_minFrac, _maxFrac],
                snapAnimationDuration: const Duration(milliseconds: 380),
                builder: (context, sc) => DecoratedBox(
                  decoration: const BoxDecoration(
                    color: AtlasColors.surface,
                    borderRadius: BorderRadius.vertical(
                      top: Radius.circular(20),
                    ),
                    boxShadow: [
                      BoxShadow(color: Color(0x80000000), blurRadius: 24),
                    ],
                  ),
                  child: ClipRRect(
                    borderRadius: const BorderRadius.vertical(
                      top: Radius.circular(20),
                    ),
                    child: _sheetContent(sc, data),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _sheetContent(ScrollController sc, AtlasData data) {
    return CustomScrollView(
      controller: sc,
      slivers: [
        const SliverToBoxAdapter(
          child: Center(
            child: Padding(
              padding: EdgeInsets.only(top: 8),
              child: SizedBox(
                width: 36,
                height: 5,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: AtlasColors.textTertiary,
                    borderRadius: BorderRadius.all(Radius.circular(3)),
                  ),
                ),
              ),
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: AtlasSectionHeader(
            'Trending Countries',
            actionLabel: 'See All',
            onAction: _search,
          ),
        ),
        SliverToBoxAdapter(
          child: AtlasShelf(
            height: 96,
            count: _trending.length,
            itemBuilder: (_, i) {
              final c = _trending[i];
              return AtlasTile(
                width: 140,
                onTap: () => _openCountryPopup(c),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(c.flag, style: const TextStyle(fontSize: 26)),
                    const Spacer(),
                    Text(
                      c.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AtlasText.headline.copyWith(fontSize: 15),
                    ),
                    Text(
                      c.continent,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AtlasText.caption,
                    ),
                  ],
                ),
              );
            },
          ),
        ),
        SliverToBoxAdapter(
          child: AtlasSectionHeader(
            'Popular Music Cities',
            actionLabel: 'Explore',
            onAction: _search,
          ),
        ),
        SliverToBoxAdapter(
          child: AtlasShelf(
            height: 108,
            count: _topCities.length,
            itemBuilder: (_, i) {
              final c = _topCities[i];
              return AtlasTile(
                width: 156,
                onTap: () => _openCityPopup(c),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(c.flag, style: const TextStyle(fontSize: 24)),
                    const SizedBox(height: 6),
                    Text(
                      c.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AtlasText.headline.copyWith(fontSize: 15),
                    ),
                    Text(
                      c.country,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AtlasText.caption,
                    ),
                    const Spacer(),
                    Text(
                      c.genres.isNotEmpty ? c.genres.first : 'Local Music',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AtlasText.caption.copyWith(
                        color: AtlasColors.accent,
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
        const SliverToBoxAdapter(
          child: AtlasSectionHeader(
            'Musical Journeys',
            subtitle: 'Curated global sound routes',
          ),
        ),
        SliverToBoxAdapter(
          child: AtlasShelf(
            height: 128,
            count: data.journeys.length,
            itemBuilder: (_, i) {
              final j = data.journeys[i];
              return AtlasTile(
                width: 232,
                radius: 16,
                onTap: () => _push(JourneyDetailScreen(journey: j)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(j.heroEmoji, style: const TextStyle(fontSize: 24)),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            j.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AtlasText.headline.copyWith(fontSize: 15),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      j.subtitle,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: AtlasText.footnote,
                    ),
                    const Spacer(),
                    Row(
                      children: [
                        Text(
                          '${j.stops.length} Stops',
                          style: AtlasText.caption.copyWith(
                            color: AtlasColors.accent,
                          ),
                        ),
                        const Spacer(),
                        const Icon(
                          CupertinoIcons.chevron_forward,
                          size: 13,
                          color: AtlasColors.textTertiary,
                        ),
                      ],
                    ),
                  ],
                ),
              );
            },
          ),
        ),
        const SliverToBoxAdapter(
          child: AtlasSectionHeader(
            'Sound Time Machine',
            subtitle: 'Explore music across the decades',
          ),
        ),
        SliverToBoxAdapter(
          child: AtlasShelf(
            height: 84,
            count: _decades.length,
            itemBuilder: (_, i) {
              final (decade, label, emoji) = _decades[i];
              return AtlasTile(
                width: 132,
                padding: const EdgeInsets.all(12),
                onTap: () {
                  AtlasMusicSource.instance.topSongs(label, limit: 15).then((
                    songs,
                  ) {
                    if (songs.isNotEmpty) {
                      AtlasMusicSource.instance.playAll(songs);
                    }
                  });
                },
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(emoji, style: const TextStyle(fontSize: 18)),
                        const Spacer(),
                        Text(
                          decade,
                          style: AtlasText.caption.copyWith(
                            color: AtlasColors.accent,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                    const Spacer(),
                    Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AtlasText.caption.copyWith(
                        color: AtlasColors.textPrimary,
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
        if (data.battles.isNotEmpty) ...[
          const SliverToBoxAdapter(
            child: AtlasSectionHeader(
              'City vs City Battles',
              subtitle: 'Vote for your favorite music capital',
            ),
          ),
          SliverToBoxAdapter(
            child: AtlasShelf(
              height: 112,
              count: data.battles.length,
              itemBuilder: (_, i) => _BattleTile(
                battle: data.battles[i],
                onTap: () => _openCityPopup(data.battles[i].cityA),
              ),
            ),
          ),
        ],
        const SliverToBoxAdapter(child: SizedBox(height: 140)),
      ],
    );
  }

  static const _decades = [
    ('1960s', '60s Classics', '🎸'),
    ('1970s', '70s Rock & Disco', '🪩'),
    ('1980s', '80s Synth & Pop', '📼'),
    ('1990s', '90s Grunge & Hip-Hop', '📻'),
    ('2000s', '2000s Pop & R&B', '💿'),
    ('2010s', '2010s Streaming Era', '🎧'),
    ('2020s', 'Modern Global Hits', '⚡'),
  ];

  /// Popover layer. Position is computed once when it opens (the camera is
  /// already centred on the target and any drag/zoom dismisses it), so
  /// nothing here rebuilds per frame.
  Widget _popupLayer(GlobeController ctrl, AtlasData data) {
    return ValueListenableBuilder<Object?>(
      valueListenable: _popup,
      builder: (context, v, _) {
        if (v == null) return const SizedBox.shrink();
        final p = v is AtlasCity
            ? ctrl.projectCity(v)
            : ctrl.projectCountry(v as AtlasCountry);
        if (p == null) return const SizedBox.shrink();
        final w = CityPopup.width;
        const h = CityPopup.totalHeight;
        final boxW = MediaQuery.sizeOf(context).width;
        final flipped = p.dy - 12 - h < 6;
        final top = flipped ? p.dy + 12 : p.dy - 12 - h;
        final left = (p.dx - w / 2).clamp(12.0, boxW - w - 12).toDouble();
        final arrowX = (p.dx - left).clamp(30.0, w - 30).toDouble();
        final Widget card;
        if (v is AtlasCity) {
          card = CityPopup(
            city: v,
            arrowX: arrowX,
            flipped: flipped,
            onOpen: () => _push(CityScreen(city: v)),
            onPlay: () => AtlasActions.instance.playCityMix(context, v),
          );
        } else {
          final country = v as AtlasCountry;
          card = CountryPopup(
            country: country,
            cityCount: data.citiesInCountry(country.iso).length,
            arrowX: arrowX,
            flipped: flipped,
            onOpen: () => _push(CountryScreen(country: country)),
            onPlay: () {
              AtlasMusicSource.instance.getCountryCharts(country.iso).then((c) {
                if (c.tracks.isNotEmpty) {
                  AtlasMusicSource.instance.playAll(c.tracks);
                }
              });
            },
          );
        }
        return Stack(
          clipBehavior: Clip.none,
          children: [
            Positioned(
              left: left,
              top: top,
              child: SpringIn(
                key: ValueKey(
                  v is AtlasCity ? 'c_${v.id}' : 'k_${(v as AtlasCountry).iso}',
                ),
                alignment: Alignment((arrowX / w) * 2 - 1, flipped ? -1 : 1),
                child: card,
              ),
            ),
          ],
        );
      },
    );
  }
}

/// Vertical +/- / reset capsule.
class _ZoomPill extends StatelessWidget {
  const _ZoomPill({
    required this.onIn,
    required this.onOut,
    required this.onReset,
  });
  final VoidCallback onIn, onOut, onReset;

  Widget _b(IconData i, VoidCallback f) => AtlasPress(
    onTap: f,
    scale: 0.85,
    child: SizedBox(
      width: 40,
      height: 40,
      child: Icon(i, size: 17, color: AtlasColors.accent),
    ),
  );

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      color: AtlasColors.surfaceHigh,
      borderRadius: BorderRadius.circular(20),
    ),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        _b(CupertinoIcons.plus, onIn),
        _b(CupertinoIcons.minus, onOut),
        _b(CupertinoIcons.arrow_counterclockwise, onReset),
      ],
    ),
  );
}

class _BattleTile extends StatelessWidget {
  const _BattleTile({required this.battle, required this.onTap});
  final AtlasBattle battle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final b = battle;
    final a = (b.ratioA * 100).round();
    return AtlasTile(
      width: 252,
      radius: 16,
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Flexible(
                child: Text(
                  '${b.cityA.flag} ${b.cityA.name}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AtlasText.headline.copyWith(fontSize: 14),
                ),
              ),
              Text(
                '  vs  ',
                style: AtlasText.caption.copyWith(color: AtlasColors.accent),
              ),
              Flexible(
                child: Text(
                  '${b.cityB.flag} ${b.cityB.name}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AtlasText.headline.copyWith(fontSize: 14),
                ),
              ),
            ],
          ),
          const SizedBox(height: 3),
          Text(
            b.tagline,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AtlasText.footnote,
          ),
          const Spacer(),
          ClipRRect(
            borderRadius: BorderRadius.circular(3),
            child: Row(
              children: [
                Expanded(
                  flex: a.clamp(1, 99),
                  child: Container(height: 5, color: AtlasColors.accent),
                ),
                Expanded(
                  flex: (100 - a).clamp(1, 99),
                  child: Container(height: 5, color: AtlasColors.fill),
                ),
              ],
            ),
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              Text(
                '$a%',
                style: AtlasText.caption.copyWith(color: AtlasColors.accent),
              ),
              const Spacer(),
              Text('${100 - a}%', style: AtlasText.caption),
            ],
          ),
        ],
      ),
    );
  }
}
