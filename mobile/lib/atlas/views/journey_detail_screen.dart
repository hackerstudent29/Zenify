import 'package:flutter/cupertino.dart';

import '../../design_system/motion/zen_page_route.dart';
import '../core/atlas_tokens.dart';
import '../core/haptics.dart';
import '../data/atlas_music_source.dart';
import '../data/atlas_repository.dart';
import '../models/atlas_models.dart';
import '../services/passport_store.dart';
import '../widgets/atlas_components.dart';
import '../widgets/atlas_press.dart';
import 'city_screen.dart';

class JourneyDetailScreen extends StatefulWidget {
  const JourneyDetailScreen({super.key, required this.journey});
  final AtlasJourney journey;

  @override
  State<JourneyDetailScreen> createState() => _JourneyDetailScreenState();
}

class _JourneyDetailScreenState extends State<JourneyDetailScreen> {
  bool _isPlaying = false;

  Future<void> _start() async {
    final stops = widget.journey.stops;
    if (stops.isEmpty || _isPlaying) return;
    H.select();
    setState(() => _isPlaying = true);
    final all = <AtlasSong>[];
    for (final s in stops) {
      if (s.suggestedArtist != null) {
        all.addAll(
          await AtlasMusicSource.instance.topSongs(
            s.suggestedArtist!,
            limit: 2,
          ),
        );
      }
    }
    if (all.isNotEmpty) {
      await AtlasMusicSource.instance.playAll(all);
      PassportStore.instance.stamp('journey_${widget.journey.id}');
    }
    if (mounted) setState(() => _isPlaying = false);
  }

  @override
  Widget build(BuildContext context) {
    final j = widget.journey;
    return CupertinoPageScaffold(
      backgroundColor: AtlasColors.bg,
      child: CustomScrollView(
        physics: const BouncingScrollPhysics(),
        slivers: [
          AtlasSliverNav(j.title),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 56,
                        height: 56,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: AtlasColors.surfaceHigh,
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Text(
                          j.heroEmoji,
                          style: const TextStyle(fontSize: 28),
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            AtlasBadge(j.category.toUpperCase(), accent: true),
                            const SizedBox(height: 4),
                            Text(j.subtitle, style: AtlasText.sub),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Text(
                    j.description,
                    style: AtlasText.sub.copyWith(height: 1.4),
                  ),
                  const SizedBox(height: 18),
                  AtlasPress(
                    onTap: _start,
                    scale: 0.97,
                    child: Container(
                      height: 50,
                      decoration: BoxDecoration(
                        color: AtlasColors.accent,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Center(
                        child: AnimatedSwitcher(
                          duration: const Duration(milliseconds: 200),
                          child: _isPlaying
                              ? const CupertinoActivityIndicator(
                                  key: ValueKey('l'),
                                  color: AtlasColors.textPrimary,
                                )
                              : const Row(
                                  key: ValueKey('t'),
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(
                                      CupertinoIcons.play_fill,
                                      size: 17,
                                      color: AtlasColors.textPrimary,
                                    ),
                                    SizedBox(width: 8),
                                    Text(
                                      'Start Journey',
                                      style: TextStyle(
                                        fontSize: 17,
                                        fontWeight: FontWeight.w600,
                                        color: AtlasColors.textPrimary,
                                      ),
                                    ),
                                  ],
                                ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: AtlasSectionHeader(
              'Stops',
              subtitle: '${j.stops.length} cities',
            ),
          ),
          SliverList.builder(
            itemCount: j.stops.length,
            itemBuilder: (context, i) => _StopRow(
              stop: j.stops[i],
              index: i + 1,
              last: i == j.stops.length - 1,
              onTap: () {
                final city = AtlasRepository.instance.cityById(
                  j.stops[i].cityId,
                );
                if (city == null) return;
                Navigator.of(
                  context,
                ).push(ZenPageRoute(builder: (_) => CityScreen(city: city)));
              },
            ),
          ),
          const SliverToBoxAdapter(child: SizedBox(height: 140)),
        ],
      ),
    );
  }
}

class _StopRow extends StatelessWidget {
  const _StopRow({
    required this.stop,
    required this.index,
    required this.last,
    required this.onTap,
  });
  final AtlasJourneyStop stop;
  final int index;
  final bool last;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => AtlasPress(
    onTap: onTap,
    scale: 0.985,
    child: Container(
      margin: const EdgeInsets.symmetric(horizontal: 20),
      padding: const EdgeInsets.symmetric(vertical: 14),
      decoration: BoxDecoration(
        border: last
            ? null
            : const Border(
                bottom: BorderSide(color: AtlasColors.divider, width: 0.5),
              ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 28,
            height: 28,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: AtlasColors.accent,
              shape: BoxShape.circle,
            ),
            child: Text(
              '$index',
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: AtlasColors.textPrimary,
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(stop.cityName, style: AtlasText.headline),
                Text(stop.country, style: AtlasText.footnote),
                const SizedBox(height: 4),
                Text(
                  stop.description,
                  style: AtlasText.sub.copyWith(fontSize: 14, height: 1.35),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    AtlasBadge(stop.genre, accent: true),
                    if (stop.suggestedArtist != null) ...[
                      const SizedBox(width: 8),
                      Flexible(
                        child: Text(
                          stop.suggestedArtist!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AtlasText.caption,
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
          const Padding(
            padding: EdgeInsets.only(top: 4),
            child: Icon(
              CupertinoIcons.chevron_forward,
              size: 15,
              color: AtlasColors.textTertiary,
            ),
          ),
        ],
      ),
    ),
  );
}
