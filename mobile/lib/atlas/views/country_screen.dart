import 'package:flutter/cupertino.dart';

import '../../design_system/motion/zen_page_route.dart';
import '../core/atlas_tokens.dart';
import '../core/haptics.dart';
import '../data/atlas_music_source.dart';
import '../data/atlas_repository.dart';
import '../models/atlas_models.dart';
import '../services/passport_store.dart';
import '../widgets/atlas_components.dart';
import 'city_screen.dart';

class CountryScreen extends StatefulWidget {
  const CountryScreen({super.key, required this.country});
  final AtlasCountry country;

  @override
  State<CountryScreen> createState() => _CountryScreenState();
}

class _CountryScreenState extends State<CountryScreen> {
  late final Future<AtlasCountryCharts> _charts;
  late final Future<List<AtlasSong>> _releases;

  @override
  void initState() {
    super.initState();
    PassportStore.instance.stamp('country_${widget.country.iso}');
    _charts = AtlasMusicSource.instance.getCountryCharts(widget.country.iso);
    _releases = AtlasMusicSource.instance.getCountryNewReleases(
      widget.country.iso,
    );
  }

  void _playAll(List<AtlasSong> s, {bool shuffle = false}) {
    if (s.isEmpty) return;
    H.select();
    AtlasMusicSource.instance.playAll(s, shuffle: shuffle);
  }

  @override
  Widget build(BuildContext context) {
    final country = widget.country;
    final cities = AtlasRepository.instance.citiesInCountry(country.iso);
    return CupertinoPageScaffold(
      backgroundColor: AtlasColors.bg,
      child: CustomScrollView(
        physics: const BouncingScrollPhysics(),
        slivers: [
          AtlasSliverNav(country.name),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(country.flag, style: const TextStyle(fontSize: 40)),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(country.continent, style: AtlasText.sub),
                            const SizedBox(height: 4),
                            AtlasBadge(
                              country.hasCharts
                                  ? 'Official Charts'
                                  : 'Localized Music · ${country.iso}',
                              icon: country.hasCharts
                                  ? CupertinoIcons.checkmark_seal_fill
                                  : CupertinoIcons.globe,
                              accent: country.hasCharts,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  FutureBuilder<AtlasCountryCharts>(
                    future: _charts,
                    builder: (_, snap) {
                      final t = snap.data?.tracks ?? const <AtlasSong>[];
                      return AtlasPlayRow(
                        enabled: t.isNotEmpty,
                        onPlay: () => _playAll(t),
                        onShuffle: () => _playAll(t, shuffle: true),
                      );
                    },
                  ),
                ],
              ),
            ),
          ),
          if (cities.isNotEmpty) ...[
            SliverToBoxAdapter(
              child: AtlasSectionHeader(
                'Music Cities',
                subtitle: '${cities.length} in ${country.name}',
              ),
            ),
            SliverToBoxAdapter(
              child: AtlasShelf(
                height: 116,
                count: cities.length,
                itemBuilder: (context, i) {
                  final c = cities[i];
                  return AtlasTile(
                    width: 148,
                    onTap: () => Navigator.of(
                      context,
                    ).push(ZenPageRoute(builder: (_) => CityScreen(city: c))),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          c.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AtlasText.headline.copyWith(fontSize: 15),
                        ),
                        Text(
                          c.region.isNotEmpty ? c.region : c.country,
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
          ],
          FutureBuilder<AtlasCountryCharts>(
            future: _charts,
            builder: (context, snap) {
              if (snap.connectionState != ConnectionState.done) {
                return const SliverToBoxAdapter(
                  child: Padding(
                    padding: EdgeInsets.symmetric(vertical: 36),
                    child: Center(child: CupertinoActivityIndicator()),
                  ),
                );
              }
              final tracks = snap.data?.tracks ?? const <AtlasSong>[];
              final artists = snap.data?.artists ?? const <AtlasChartArtist>[];
              return SliverMainAxisGroup(
                slivers: [
                  if (artists.isNotEmpty) ...[
                    const SliverToBoxAdapter(
                      child: AtlasSectionHeader('Top Artists'),
                    ),
                    SliverToBoxAdapter(
                      child: AtlasShelf(
                        height: 128,
                        gap: 16,
                        count: artists.length,
                        itemBuilder: (_, i) => AtlasArtistItem(
                          name: artists[i].name,
                          imageUrl: artists[i].image,
                        ),
                      ),
                    ),
                  ],
                  if (tracks.isNotEmpty) ...[
                    SliverToBoxAdapter(
                      child: AtlasSectionHeader(
                        country.hasCharts
                            ? 'Top Songs'
                            : 'Popular in ${country.name}',
                      ),
                    ),
                    SliverList.builder(
                      itemCount: tracks.length,
                      itemBuilder: (_, i) => AtlasSongRow(
                        song: tracks[i],
                        rank: i + 1,
                        onTap: () => AtlasMusicSource.instance.playQueue(
                          tracks,
                          startIndex: i,
                        ),
                      ),
                    ),
                  ],
                ],
              );
            },
          ),
          FutureBuilder<List<AtlasSong>>(
            future: _releases,
            builder: (context, snap) {
              final r = (snap.data ?? const <AtlasSong>[]).take(8).toList();
              if (r.isEmpty) {
                return const SliverToBoxAdapter(child: SizedBox.shrink());
              }
              return SliverMainAxisGroup(
                slivers: [
                  const SliverToBoxAdapter(
                    child: AtlasSectionHeader('New Releases'),
                  ),
                  SliverList.builder(
                    itemCount: r.length,
                    itemBuilder: (_, i) => AtlasSongRow(
                      song: r[i],
                      onTap: () =>
                          AtlasMusicSource.instance.playQueue(r, startIndex: i),
                    ),
                  ),
                ],
              );
            },
          ),
          const SliverToBoxAdapter(child: SizedBox(height: 140)),
        ],
      ),
    );
  }
}
