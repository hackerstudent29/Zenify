import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/services/youtube_link_importer.dart';
import 'package:mobile/services/innertube_service.dart';

void main() {
  test('Resolve WhatsApp user playlists', () async {
    final link1 = 'https://music.youtube.com/playlist?list=PL_DaWb6RFQc3wAIq902qsaV7zqWs9bseI&si=h9pbz2Qt3hXwFftU&drli=1';
    final link2 = 'https://music.youtube.com/playlist?list=PLoZfs_FvSymfxWhlCrk56ZF01rJK_WMj8&si=-aPbdYDSOJv7Ynkz&drli=1';

    print('Testing Link 1...');
    final params1 = YouTubeLinkImporter.extractParametersForTesting(link1);
    print('Params 1: $params1');
    expect(params1.playlistId, 'PL_DaWb6RFQc3wAIq902qsaV7zqWs9bseI');

    final res1 = await InnerTubeService.instance.getPlaylist(params1.playlistId!);
    print('Res 1: title=${res1?.title}, tracksCount=${res1?.tracks.length}');
    expect(res1, isNotNull);
    expect(res1!.tracks.isNotEmpty, true);

    print('Testing Link 2...');
    final params2 = YouTubeLinkImporter.extractParametersForTesting(link2);
    print('Params 2: $params2');
    expect(params2.playlistId, 'PLoZfs_FvSymfxWhlCrk56ZF01rJK_WMj8');

    final res2 = await InnerTubeService.instance.getPlaylist(params2.playlistId!);
    print('Res 2: title=${res2?.title}, tracksCount=${res2?.tracks.length}');
    expect(res2, isNotNull);
    expect(res2!.tracks.isNotEmpty, true);
  });
}
