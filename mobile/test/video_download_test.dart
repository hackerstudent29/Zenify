import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile/models/track.dart';
import 'package:mobile/services/download_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('Video song download resolves native progressive video+audio streams and skips lyrics', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    final tmpDir = await Directory.systemTemp.createTemp('zenify_vid_dl_test');
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final baseUrl = 'http://${server.address.address}:${server.port}';
    final videoBytes = List<int>.filled(4096, 0x2A);
    final audioBytes = List<int>.filled(2048, 0x1B);

    server.listen((req) async {
      if (req.uri.path == '/video.mp4') {
        req.response.statusCode = HttpStatus.ok;
        req.response.headers.contentType = ContentType('video', 'mp4');
        req.response.add(videoBytes);
      } else if (req.uri.path == '/audio.m4a') {
        req.response.statusCode = HttpStatus.ok;
        req.response.headers.contentType = ContentType('audio', 'mp4');
        req.response.add(audioBytes);
      } else {
        req.response.statusCode = HttpStatus.notFound;
      }
      await req.response.close();
    });

    const pathChannel = MethodChannel('plugins.flutter.io/path_provider');
    const innertubeChannel = MethodChannel('zenify/innertube');
    const audioChannel = MethodChannel('zenify/audio');

    Map<Object?, Object?>? lastGetStreamArgs;
    var lyricsRequested = false;

    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(pathChannel, (call) async {
          if (call.method == 'getApplicationDocumentsDirectory') {
            return tmpDir.path;
          }
          return null;
        });
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(audioChannel, (call) async {
          if (call.method == 'isWifiConnected') return true;
          return null;
        });
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(innertubeChannel, (call) async {
          if (call.method == 'getStreamUrl') {
            lastGetStreamArgs = call.arguments as Map<Object?, Object?>?;
            return {
              'url': '$baseUrl/audio.m4a',
              'videoUrl': '$baseUrl/video.mp4',
              'videoHeight': 720,
              'isHls': false,
              'headers': <String, String>{},
              'itag': 136,
              'contentLength': audioBytes.length,
            };
          }
          if (call.method == 'getLyrics') {
            lyricsRequested = true;
          }
          return null;
        });

    addTearDown(() async {
      debugDefaultTargetPlatformOverride = null;
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(pathChannel, null);
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(audioChannel, null);
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(innertubeChannel, null);
      await DownloadService.instance.deleteAllDownloads();
      await server.close(force: true);
      if (await tmpDir.exists()) {
        await tmpDir.delete(recursive: true);
      }
    });

    final videoTrack = Track(
      id: 'yt-vid12345678',
      title: 'Test Song (Official Video)',
      artist: 'Test Artist',
      album: 'Music Video',
      coverUrl: '',
      durationSeconds: 180,
      isVideo: true,
    );

    final ok = await DownloadService.instance.downloadTrack(videoTrack);
    expect(ok, isTrue);

    expect(lastGetStreamArgs?['wantVideo'], isTrue);
    expect(lastGetStreamArgs?['allowHls'], isFalse);

    final downloaded = DownloadService.instance.getDownloaded(videoTrack.id);
    expect(downloaded, isNotNull);
    expect(downloaded!.isVideo, isTrue);
    expect(downloaded.lyricsPath, isNull);
    expect(lyricsRequested, isFalse);

    final localVideo = DownloadService.instance.getLocalVideoPath(videoTrack.id);
    final localAudio = DownloadService.instance.getLocalAudioPath(videoTrack.id);
    expect(localVideo, isNotNull);
    expect(localAudio, isNotNull);
    expect(File(localVideo!).lengthSync(), equals(videoBytes.length));
    expect(File(localAudio!).lengthSync(), equals(audioBytes.length));
    expect(DownloadService.instance.getLocalLyrics(videoTrack.id), isNull);
  });
}
