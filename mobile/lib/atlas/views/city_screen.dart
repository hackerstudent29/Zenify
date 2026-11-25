import 'package:flutter/cupertino.dart';

import '../core/atlas_tokens.dart';
import '../core/haptics.dart';
import '../data/atlas_music_source.dart';
import '../models/atlas_models.dart';
import '../services/passport_store.dart';
import '../widgets/atlas_components.dart';

class CityScreen extends StatefulWidget {
  const CityScreen({super.key, required this.city});
  final AtlasCity city;

  @override
  State<CityScreen> createState() => _CityScreenState();
}

class _CityScreenState extends State<CityScreen> {
  late final Future<AtlasCityPlaylist> _playlist;

  @override
  void initState() {
    super.initState();
    PassportStore.instance.stamp(widget.city.id);
    _playlist = AtlasMusicSource.instance.getCityPlaylist(widget.city);
  }

  void _playAll(List<AtlasSong> s, {bool shuffle = false}) {
    if (s.isEmpty) return;
    H.select();
    AtlasMusicSource.instance.playAll(s, shuffle: shuffle);
  }

  @override
  Widget build(BuildContext context) {
    final city = widget.city;
    return CupertinoPageScaffold(
      backgroundColor: AtlasColors.bg,
      child: CustomScrollView(
        physics: const BouncingScrollPhysics(),
        slivers: [
          AtlasSliverNav(city.name),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(city.flag, style: const TextStyle(fontSize: 40)),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              city.country,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: AtlasText.sub,
                            ),
                            if (city.region.isNotEmpty)
                              Text(
                                city.region,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: AtlasText.footnote,
                              ),
                          ],
                        ),
                      ),
                      AnimatedBuilder(
                        animation: PassportStore.instance,
                        builder: (_, _) =>
                            PassportStore.instance.isStamped(city.id)
                            ? const AtlasBadge(
                                'Stamped',
                                icon: CupertinoIcons.checkmark_seal_fill,
                                accent: true,
                              )
                            : const SizedBox.shrink(),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  FutureBuilder<AtlasCityPlaylist>(
                    future: _playlist,
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
          if (city.artists.isNotEmpty) ...[
            const SliverToBoxAdapter(
              child: AtlasSectionHeader('Featured Artists'),
            ),
            SliverToBoxAdapter(
              child: AtlasShelf(
                height: 124,
                gap: 16,
                count: city.artists.length,
                itemBuilder: (_, i) => AtlasArtistItem(name: city.artists[i]),
              ),
            ),
          ],
          FutureBuilder<AtlasCityPlaylist>(
            future: _playlist,
            builder: (context, snap) {
              if (snap.connectionState != ConnectionState.done) {
                return const SliverToBoxAdapter(
                  child: Padding(
                    padding: EdgeInsets.symmetric(vertical: 36),
                    child: Center(child: CupertinoActivityIndicator()),
                  ),
                );
              }
              final songs = snap.data?.tracks ?? const <AtlasSong>[];
              if (songs.isEmpty) {
                return const SliverToBoxAdapter(child: SizedBox.shrink());
              }
              final title = snap.data?.playlistTitle ?? '${city.name} Mix';
              return SliverMainAxisGroup(
                slivers: [
                  SliverToBoxAdapter(child: AtlasSectionHeader(title)),
                  SliverList.builder(
                    itemCount: songs.length,
                    itemBuilder: (_, i) => AtlasSongRow(
                      song: songs[i],
                      rank: i + 1,
                      onTap: () => AtlasMusicSource.instance.playQueue(
                        songs,
                        startIndex: i,
                      ),
                    ),
                  ),
                ],
              );
            },
          ),
          if (city.genres.isNotEmpty) ...[
            const SliverToBoxAdapter(
              child: AtlasSectionHeader('Musical Identity'),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final g in city.genres)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 8,
                        ),
                        decoration: BoxDecoration(
                          color: AtlasColors.surfaceHigh,
                          borderRadius: BorderRadius.circular(18),
                        ),
                        child: Text(
                          g,
                          style: AtlasText.sub.copyWith(
                            fontSize: 14,
                            color: AtlasColors.textPrimary,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ],
          SliverToBoxAdapter(
            child: SizedBox(height: 180 + MediaQuery.paddingOf(context).bottom),
          ),
        ],
      ),
    );
  }
}
