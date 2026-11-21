import 'package:flutter/cupertino.dart';

import '../core/atlas_tokens.dart';
import '../models/atlas_models.dart';
import '../widgets/artist_avatar.dart';
import '../widgets/atlas_callout.dart';
import '../widgets/atlas_components.dart';

/// Quick preview above a tapped city: tap card to open, red button to play.
class CityPopup extends StatelessWidget {
  const CityPopup({
    super.key,
    required this.city,
    required this.arrowX,
    required this.flipped,
    required this.onOpen,
    required this.onPlay,
  });

  static const double width = AtlasCallout.width;
  static const double totalHeight = AtlasCallout.totalHeight;

  final AtlasCity city;
  final double arrowX;
  final bool flipped;
  final VoidCallback onOpen;
  final VoidCallback onPlay;

  @override
  Widget build(BuildContext context) {
    final artists = city.artists.take(4).toList();
    return AtlasCallout(
      arrowX: arrowX,
      flipped: flipped,
      onOpen: onOpen,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(city.flag, style: const TextStyle(fontSize: 30)),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      city.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AtlasText.title3,
                    ),
                    Text(
                      city.country,
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
              for (var i = 0; i < artists.length; i++)
                Padding(
                  padding: EdgeInsets.only(
                    right: i < artists.length - 1 ? 10 : 0,
                  ),
                  child: SizedBox(
                    width: 56,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        ArtistAvatar(name: artists[i], size: 34),
                        const SizedBox(height: 3),
                        Text(
                          artists[i],
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          textAlign: TextAlign.center,
                          style: AtlasText.caption.copyWith(fontSize: 10),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
