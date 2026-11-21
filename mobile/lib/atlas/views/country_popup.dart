import 'package:flutter/cupertino.dart';

import '../core/atlas_tokens.dart';
import '../models/atlas_models.dart';
import '../widgets/atlas_callout.dart';
import '../widgets/atlas_components.dart';

/// Quick preview above a tapped country.
class CountryPopup extends StatelessWidget {
  const CountryPopup({
    super.key,
    required this.country,
    required this.cityCount,
    required this.arrowX,
    required this.flipped,
    required this.onOpen,
    required this.onPlay,
  });

  static const double width = AtlasCallout.width;
  static const double totalHeight = AtlasCallout.totalHeight;

  final AtlasCountry country;
  final int cityCount;
  final double arrowX;
  final bool flipped;
  final VoidCallback onOpen;
  final VoidCallback onPlay;

  @override
  Widget build(BuildContext context) {
    return AtlasCallout(
      arrowX: arrowX,
      flipped: flipped,
      onOpen: onOpen,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(country.flag, style: const TextStyle(fontSize: 32)),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      country.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AtlasText.title3,
                    ),
                    Text(
                      country.continent,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AtlasText.footnote,
                    ),
                  ],
                ),
              ),
              AtlasPlayCircle(onTap: onPlay),
            ],
          ),
          const Spacer(),
          Row(
            children: [
              AtlasBadge(
                country.hasCharts ? 'Official Charts' : 'Localized Mix',
                icon: country.hasCharts
                    ? CupertinoIcons.chart_bar_fill
                    : CupertinoIcons.globe,
                accent: country.hasCharts,
              ),
              if (cityCount > 0) ...[
                const SizedBox(width: 8),
                AtlasBadge('$cityCount ${cityCount == 1 ? 'City' : 'Cities'}'),
              ],
              const Spacer(),
              const Icon(
                CupertinoIcons.chevron_forward,
                size: 15,
                color: AtlasColors.textTertiary,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
