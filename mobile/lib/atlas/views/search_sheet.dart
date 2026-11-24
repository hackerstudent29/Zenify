import 'dart:math' as math;

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import '../core/atlas_tokens.dart';
import '../core/haptics.dart';
import '../core/spring.dart';
import '../data/atlas_repository.dart';
import '../models/atlas_models.dart';
import '../widgets/atlas_components.dart';
import '../widgets/atlas_press.dart';
import '../../services/dock_visibility.dart';

typedef AtlasSearchResult = ({
  AtlasCity? city,
  AtlasCountry? country,
  AtlasJourney? journey,
});

Future<AtlasSearchResult?> showAtlasSearch(
  BuildContext context,
  AtlasData data,
) {
  return DockVisibility.runModal(
    () => showModalBottomSheet<AtlasSearchResult>(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      barrierColor: const Color(0x99000000),
      sheetAnimationStyle: AnimationStyle(
        duration: const Duration(milliseconds: 520),
        reverseDuration: const Duration(milliseconds: 300),
        curve: const SpringCurve(),
        reverseCurve: Curves.easeInCubic,
      ),
      builder: (_) => _SearchSheet(data: data),
    ),
  );
}

class _SearchSheet extends StatefulWidget {
  const _SearchSheet({required this.data});
  final AtlasData data;

  @override
  State<_SearchSheet> createState() => _SearchSheetState();
}

class _SearchSheetState extends State<_SearchSheet> {
  final _text = TextEditingController();
  String _category = 'all';
  String _region = 'All';
  late List<AtlasHit> _hits = _query();

  static const _categories = [
    ('all', 'All'),
    ('country', 'Countries'),
    ('city', 'Cities'),
    ('artist', 'Artists'),
    ('journey', 'Journeys'),
  ];
  static const _regions = [
    'All',
    'Asia',
    'Europe',
    'North America',
    'South America',
    'Africa',
    'Oceania',
  ];

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  List<AtlasHit> _query() => widget.data.search(
    _text.text,
    categoryFilter: _category,
    regionFilter: _region,
  );

  void _refresh() => setState(() => _hits = _query());

  void _pick(AtlasHit h) {
    H.select();
    FocusScope.of(context).unfocus();
    Navigator.of(
      context,
    ).pop((city: h.city, country: h.country, journey: h.journey));
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final inset = MediaQuery.viewInsetsOf(context).bottom;
    final height = math.min(size.height * 0.92, size.height - inset - 48);
    return Padding(
      padding: EdgeInsets.only(bottom: inset),
      child: Align(
        alignment: Alignment.bottomCenter,
        child: SizedBox(
          height: height,
          child: DecoratedBox(
            decoration: const BoxDecoration(
              color: AtlasColors.surface,
              borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
            ),
            child: Column(
              children: [
                const SizedBox(height: 8),
                Container(
                  width: 36,
                  height: 5,
                  decoration: BoxDecoration(
                    color: AtlasColors.textTertiary,
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
                  child: CupertinoSearchTextField(
                    controller: _text,
                    autofocus: true,
                    placeholder: 'Countries, cities, artists, journeys',
                    style: AtlasText.body,
                    placeholderStyle: AtlasText.body.copyWith(
                      color: AtlasColors.textTertiary,
                    ),
                    backgroundColor: AtlasColors.surfaceHigh,
                    itemColor: AtlasColors.textSecondary,
                    onChanged: (_) => _refresh(),
                  ),
                ),
                SizedBox(
                  height: 36,
                  child: ListView.separated(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    scrollDirection: Axis.horizontal,
                    physics: const BouncingScrollPhysics(),
                    itemCount: _categories.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 8),
                    itemBuilder: (_, i) {
                      final (key, label) = _categories[i];
                      return AtlasChip(
                        label,
                        selected: _category == key,
                        onTap: () {
                          _category = key;
                          _refresh();
                        },
                      );
                    },
                  ),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  height: 30,
                  child: ListView.separated(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    scrollDirection: Axis.horizontal,
                    physics: const BouncingScrollPhysics(),
                    itemCount: _regions.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 6),
                    itemBuilder: (_, i) {
                      final r = _regions[i];
                      final on = _region == r;
                      return AtlasPress(
                        onTap: () {
                          _region = r;
                          _refresh();
                        },
                        scale: 0.94,
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 220),
                          curve: Curves.easeOutCubic,
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: on ? AtlasColors.fill : Colors.transparent,
                            borderRadius: BorderRadius.circular(15),
                          ),
                          child: Text(
                            r,
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: on
                                  ? AtlasColors.textPrimary
                                  : AtlasColors.textTertiary,
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
                const SizedBox(height: 4),
                Expanded(
                  child: _hits.isEmpty
                      ? const Center(
                          child: Text('No Results', style: AtlasText.sub),
                        )
                      : ListView.builder(
                          keyboardDismissBehavior:
                              ScrollViewKeyboardDismissBehavior.onDrag,
                          physics: const BouncingScrollPhysics(),
                          padding: const EdgeInsets.only(bottom: 24),
                          itemExtent: 60,
                          itemCount: _hits.length,
                          itemBuilder: (_, i) => _HitRow(
                            hit: _hits[i],
                            onTap: () => _pick(_hits[i]),
                          ),
                        ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _HitRow extends StatelessWidget {
  const _HitRow({required this.hit, required this.onTap});
  final AtlasHit hit;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    var emoji = '📍';
    String? badge;
    if (hit.country != null) {
      emoji = hit.country!.flag;
      if (hit.country!.hasCharts) badge = 'Charts';
    } else if (hit.city != null && hit.artist == null) {
      emoji = hit.city!.flag;
    } else if (hit.artist != null) {
      emoji = '🎤';
    } else if (hit.journey != null) {
      emoji = hit.journey!.heroEmoji;
    }
    return AtlasPress(
      onTap: onTap,
      scale: 0.985,
      haptic: false,
      child: Stack(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: AtlasColors.surfaceHigh,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(emoji, style: const TextStyle(fontSize: 20)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        hit.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AtlasText.body,
                      ),
                      Text(
                        hit.subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AtlasText.footnote,
                      ),
                    ],
                  ),
                ),
                if (badge != null) ...[
                  AtlasBadge(badge, accent: true),
                  const SizedBox(width: 8),
                ],
                const Icon(
                  CupertinoIcons.chevron_forward,
                  size: 14,
                  color: AtlasColors.textTertiary,
                ),
              ],
            ),
          ),
          const Positioned(
            left: 68,
            right: 0,
            bottom: 0,
            child: SizedBox(
              height: 0.5,
              child: ColoredBox(color: AtlasColors.divider),
            ),
          ),
        ],
      ),
    );
  }
}
