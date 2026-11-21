import 'dart:async';

import 'package:flutter/widgets.dart';

import '../core/haptics.dart';
import '../data/atlas_content.dart';
import '../data/atlas_music_source.dart';
import '../models/atlas_models.dart';
import '../widgets/atlas_toast.dart';
import 'passport_store.dart';

/// User-level actions shared by the popup, city page and passport.
class AtlasActions {
  AtlasActions._();
  static final AtlasActions instance = AtlasActions._();

  Timer? _stampTimer;

  /// Seconds of listening before a city is stamped.
  static const stampAfter = Duration(seconds: 20);

  Future<void> playCityMix(BuildContext context, AtlasCity city) async {
    H.confirm();
    final songs = await AtlasContent.instance.cityMix(city);
    if (!context.mounted) return;
    if (songs.isEmpty) {
      H.error();
      AtlasToast.show(context, 'No tracks available');
      return;
    }
    await AtlasMusicSource.instance.playQueue(songs);
    if (!context.mounted) return;
    _armStamp(context, city);
  }

  Future<void> playSongs(
    BuildContext context,
    AtlasCity city,
    List<AtlasSong> songs,
    int index,
  ) async {
    if (songs.isEmpty) return;
    await AtlasMusicSource.instance.playQueue(songs, startIndex: index);
    if (context.mounted) _armStamp(context, city);
  }

  Future<void> playArtist(
    BuildContext context,
    AtlasCity city,
    String artist,
  ) async {
    H.confirm();
    final songs = await AtlasMusicSource.instance
        .topSongs(artist, limit: 10)
        .catchError((_) => <AtlasSong>[]);
    if (!context.mounted) return;
    if (songs.isEmpty) {
      H.error();
      AtlasToast.show(context, 'No tracks available');
      return;
    }
    await AtlasMusicSource.instance.playQueue(songs);
    if (context.mounted) _armStamp(context, city);
  }

  void _armStamp(BuildContext context, AtlasCity city) {
    _stampTimer?.cancel();
    if (PassportStore.instance.isStamped(city.id)) return;
    _stampTimer = Timer(stampAfter, () async {
      if (await PassportStore.instance.stamp(city.id)) {
        H.success();
        if (context.mounted) {
          AtlasToast.show(context, '${city.flag}  ${city.name} stamped');
        }
      }
    });
  }

  void dispose() => _stampTimer?.cancel();
}
