import 'package:flutter/cupertino.dart';

import '../core/atlas_tokens.dart';
import '../core/haptics.dart';
import '../data/atlas_repository.dart';
import '../models/atlas_models.dart';
import '../services/passport_store.dart';
import '../widgets/atlas_components.dart';
import '../widgets/atlas_press.dart';

class PassportScreen extends StatelessWidget {
  const PassportScreen({super.key, required this.data, required this.onSelect});
  final AtlasData data;
  final ValueChanged<AtlasCity> onSelect;

  @override
  Widget build(BuildContext context) {
    return CupertinoPageScaffold(
      backgroundColor: AtlasColors.bg,
      child: AnimatedBuilder(
        animation: PassportStore.instance,
        builder: (context, _) {
          final countries = <String>{};
          final cities = <AtlasCity>[];
          var journeys = 0;
          for (final id in PassportStore.instance.ids) {
            if (id.startsWith('country_')) {
              countries.add(id.replaceFirst('country_', '').toUpperCase());
            } else if (id.startsWith('journey_')) {
              journeys++;
            } else {
              final c = data.cityById(id);
              if (c != null) {
                cities.add(c);
                countries.add(c.iso);
              }
            }
          }
          final continents = <String>{
            for (final c in cities)
              if (data.countryByIso(c.iso) != null)
                data.countryByIso(c.iso)!.continent,
          };
          final has = cities.isNotEmpty || countries.isNotEmpty;

          return CustomScrollView(
            physics: const BouncingScrollPhysics(),
            slivers: [
              const AtlasSliverNav('Sound Passport'),
              if (!has)
                const SliverFillRemaining(
                  hasScrollBody: false,
                  child: Center(
                    child: Padding(
                      padding: EdgeInsets.symmetric(horizontal: 40),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            CupertinoIcons.globe,
                            size: 54,
                            color: AtlasColors.textTertiary,
                          ),
                          SizedBox(height: 16),
                          Text(
                            'Your Musical Passport',
                            style: AtlasText.title3,
                          ),
                          SizedBox(height: 6),
                          Text(
                            'Explore countries and play cities on the globe to collect stamps and unlock achievements.',
                            textAlign: TextAlign.center,
                            style: AtlasText.sub,
                          ),
                        ],
                      ),
                    ),
                  ),
                )
              else ...[
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 18,
                        vertical: 16,
                      ),
                      decoration: BoxDecoration(
                        color: AtlasColors.surface,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          _Stat(cities.length, 'Cities'),
                          _Stat(countries.length, 'Countries'),
                          _Stat(continents.length, 'Continents'),
                          _Stat(journeys, 'Journeys'),
                        ],
                      ),
                    ),
                  ),
                ),
                const SliverToBoxAdapter(
                  child: AtlasSectionHeader('Milestones'),
                ),
                SliverToBoxAdapter(
                  child: _Milestones([
                    ('First Step', 'Explore a city', '🗺️', cities.isNotEmpty),
                    (
                      'Country Rover',
                      'Discover 3 countries',
                      '🌍',
                      countries.length >= 3,
                    ),
                    (
                      'Globe Trotter',
                      'Visit 3 continents',
                      '✈️',
                      continents.length >= 3,
                    ),
                    ('Voyager', 'Complete a journey', '🧭', journeys >= 1),
                    (
                      'Sound Master',
                      'Collect 10 cities',
                      '👑',
                      cities.length >= 10,
                    ),
                  ]),
                ),
                const SliverToBoxAdapter(
                  child: AtlasSectionHeader('Collected Stamps'),
                ),
                SliverPadding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  sliver: SliverGrid.builder(
                    itemCount: cities.length,
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 3,
                          mainAxisSpacing: 12,
                          crossAxisSpacing: 12,
                          childAspectRatio: 0.92,
                        ),
                    itemBuilder: (_, i) => AtlasPress(
                      scale: 0.94,
                      onTap: () {
                        H.tap();
                        onSelect(cities[i]);
                      },
                      child: Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: AtlasColors.surfaceHigh,
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              cities[i].flag,
                              style: const TextStyle(fontSize: 30),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              cities[i].name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              textAlign: TextAlign.center,
                              style: AtlasText.headline.copyWith(fontSize: 14),
                            ),
                            Text(
                              cities[i].country,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              textAlign: TextAlign.center,
                              style: AtlasText.caption,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ],
              const SliverToBoxAdapter(child: SizedBox(height: 140)),
            ],
          );
        },
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat(this.value, this.label);
  final int value;
  final String label;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      TweenAnimationBuilder<double>(
        tween: Tween(end: value.toDouble()),
        duration: const Duration(milliseconds: 700),
        curve: Curves.easeOutCubic,
        builder: (_, v, _) => Text(
          '${v.round()}',
          style: AtlasText.number.copyWith(fontSize: 28),
        ),
      ),
      const SizedBox(height: 2),
      Text(label, style: AtlasText.caption),
    ],
  );
}

class _Milestones extends StatelessWidget {
  const _Milestones(this.items);
  final List<(String, String, String, bool)> items;

  @override
  Widget build(BuildContext context) => AtlasShelf(
    height: 104,
    count: items.length,
    itemBuilder: (_, i) {
      final (title, desc, icon, on) = items[i];
      return Container(
        width: 148,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AtlasColors.surfaceHigh,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Opacity(
          opacity: on ? 1 : 0.5,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(icon, style: const TextStyle(fontSize: 20)),
                  const Spacer(),
                  Icon(
                    on
                        ? CupertinoIcons.checkmark_seal_fill
                        : CupertinoIcons.lock_fill,
                    size: 14,
                    color: on ? AtlasColors.accent : AtlasColors.textTertiary,
                  ),
                ],
              ),
              const Spacer(),
              Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AtlasText.headline.copyWith(fontSize: 14),
              ),
              Text(
                desc,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AtlasText.caption.copyWith(fontSize: 11),
              ),
            ],
          ),
        ),
      );
    },
  );
}
