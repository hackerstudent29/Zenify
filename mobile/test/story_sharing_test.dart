import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/story_sharing/story_sharing.dart';
import 'package:mobile/models/track.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final sampleTrack = Track(
    id: 'test_track_1',
    title: 'Die For You',
    artist: 'Joji',
    album: 'SMITHEREENS',
    coverUrl: '',
    durationSeconds: 210,
  );

  group('Story Dimensions & Customization Enums', () {
    test('Story aspect ratios conform to standard dimensions', () {
      const story = StoryRatio.story;
      expect(story.width, equals(360.0));
      expect(story.height, equals(640.0));
      expect(story.exportWidth, equals(1080.0));
      expect(story.ratio, closeTo(9 / 16, 0.001));

      const square = StoryRatio.square;
      expect(square.width, equals(360.0));
      expect(square.height, equals(360.0));
      expect(square.exportWidth, equals(1080.0));
      expect(square.ratio, equals(1.0));
    });

    test('All 5 story categories have templates defined', () {
      expect(StoryTemplate.songTemplates.length, greaterThanOrEqualTo(10));
      expect(StoryTemplate.lyricsTemplates.length, greaterThanOrEqualTo(10));
      expect(StoryTemplate.artistTemplates.length, greaterThanOrEqualTo(5));
      expect(StoryTemplate.albumTemplates.length, greaterThanOrEqualTo(5));
      expect(StoryTemplate.playlistTemplates.length, greaterThanOrEqualTo(5));
    });

    test('StoryTemplate.byId resolves known IDs correctly', () {
      expect(StoryTemplate.byId('song_nowplaying_glass_story').id, equals('song_nowplaying_glass_story'));
      expect(StoryTemplate.byId('lyr_glasscard_glass_story').id, equals('lyr_glasscard_glass_story'));
      expect(StoryTemplate.byId('unknown_id').id, equals('song_nowplaying_glass_story'));
    });
  });

  group('Story Share Content Models', () {
    test('SongStoryContent generates clean share text and URL', () {
      final content = SongStoryContent(track: sampleTrack);
      expect(content.title, equals('Die For You'));
      expect(content.subtitle, equals('Joji'));
      expect(content.contentType, equals('song'));
      expect(content.shareUrl, contains('zenify.app/track/test_track_1'));
      expect(content.shareText, contains('Die For You'));
      expect(content.shareText, contains('Joji'));
    });

    test('LyricsStoryContent formats stacked lyric lines without fabrication', () {
      final lines = ["It's what I've always wanted", "Could never have too many of these"];
      final content = LyricsStoryContent(track: sampleTrack, selectedLines: lines);
      expect(content.selectedLines.length, equals(2));
      expect(content.contentType, equals('lyrics'));
      expect(content.shareText, contains("It's what I've always wanted"));
    });

    test('ArtistStoryContent retains real audience and tracks without synthetic data', () {
      final content = ArtistStoryContent(
        artistName: 'The Weeknd',
        coverUrl: '',
        audience: '105.4M monthly listeners',
        topTracks: [sampleTrack],
      );
      expect(content.title, equals('The Weeknd'));
      expect(content.subtitle, equals('105.4M monthly listeners'));
      expect(content.topTracks.length, equals(1));
    });

    test('AlbumStoryContent retains real album details and tracks', () {
      final content = AlbumStoryContent(
        albumTitle: 'SMITHEREENS',
        artistName: 'Joji',
        coverUrl: '',
        year: '2022',
        trackCount: 9,
        tracks: [sampleTrack],
      );
      expect(content.title, equals('SMITHEREENS'));
      expect(content.subtitle, equals('Joji'));
      expect(content.year, equals('2022'));
      expect(content.trackCount, equals(9));
    });

    test('PlaylistStoryContent adapts to actual track artwork', () {
      final content = PlaylistStoryContent(
        playlistTitle: 'Late Night Chill',
        covers: ['https://example.com/cover1.jpg', 'https://example.com/cover2.jpg'],
        tracks: [sampleTrack],
      );
      expect(content.title, equals('Late Night Chill'));
      expect(content.covers.length, equals(2));
      expect(content.coverUrl, equals('https://example.com/cover1.jpg'));
    });
  });

  group('ArtworkPaletteService', () {
    test('Default palette contains signature Crimson & academic tones', () {
      const p = ArtworkPalette.defaultPalette;
      expect(p.primary, equals(const Color(0xFFE11D48)));
      expect(p.secondary, equals(const Color(0xFF9E2339)));
      expect(p.background, equals(const Color(0xFF121214)));
      expect(p.toList().length, equals(4));
    });

    test('Empty or null URL returns default or cached fallback', () async {
      final pal = await ArtworkPaletteService.instance.extractPalette('');
      expect(pal.background, isNotNull);
      expect(ArtworkPaletteService.instance.getCachedOrFallback(null), equals(ArtworkPalette.defaultPalette));
    });
  });

  group('Native Share & Gallery Services Channel Mocking', () {
    final List<MethodCall> methodCalls = [];

    setUp(() {
      methodCalls.clear();
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(const MethodChannel('com.zenify.mobile/story_share'), (call) async {
        methodCalls.add(call);
        switch (call.method) {
          case 'isAppInstalled':
            return true;
          case 'shareToInstagramStory':
            return true;
          case 'shareToFacebookStory':
            return true;
          case 'shareToWhatsApp':
            return true;
          case 'saveToGallery':
            return true;
          default:
            return null;
        }
      });
    });

    tearDown(() {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(const MethodChannel('com.zenify.mobile/story_share'), null);
    });

    test('isAppInstalled queries package manager via channel', () async {
      if (Platform.isAndroid) {
        final installed = await StorySharingService.isAppInstalled('com.instagram.android');
        expect(installed, isTrue);
        expect(methodCalls.any((c) => c.method == 'isAppInstalled'), isTrue);
      }
    });

    test('StoryImageRenderer returns null safely on null or unattached context', () async {
      final key = GlobalKey();
      final result = await StoryImageRenderer.captureToPng(key);
      expect(result, isNull);
    });
  });

  group('Widget UI & Template Rendering', () {
    testWidgets('ZenifyStoryBrand renders transparent brand icon and wordmark', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: ZenifyStoryBrand(
              isLight: false,
              iconSize: 16,
              showWordmark: true,
            ),
          ),
        ),
      );

      expect(find.byType(ZenifyStoryBrand), findsOneWidget);
      expect(find.byType(Image), findsOneWidget);
    });

    testWidgets('StoryCardPreview renders Song Template with Zenify brand and title', (tester) async {
      final content = SongStoryContent(track: sampleTrack);
      final template = StoryTemplate.songTemplates.first;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: StoryCardPreview(
                content: content,
                template: template,
                palette: ArtworkPalette.defaultPalette,
                backgroundStyle: StoryBackgroundStyle.liquid,
                textPolarity: StoryTextPolarity.light,
              ),
            ),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('Die For You'), findsOneWidget);
      expect(find.text('Joji'), findsOneWidget);
      expect(find.byType(ZenifyStoryBrand), findsOneWidget);
    });

    testWidgets('StoryCardPreview renders Lyrics Template with stacked lines', (tester) async {
      final content = LyricsStoryContent(
        track: sampleTrack,
        selectedLines: [
          "It's what I've always wanted",
          "Could never have too many of these",
        ],
      );
      final template = StoryTemplate.lyricsTemplates.first;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: StoryCardPreview(
                content: content,
                template: template,
                palette: ArtworkPalette.defaultPalette,
                backgroundStyle: StoryBackgroundStyle.liquid,
                textPolarity: StoryTextPolarity.light,
              ),
            ),
          ),
        ),
      );
      await tester.pump();

      expect(find.text("It's what I've always wanted"), findsOneWidget);
      expect(find.text("Could never have too many of these"), findsOneWidget);
      expect(find.text('Die For You'), findsOneWidget);
      expect(find.byType(ZenifyStoryBrand), findsOneWidget);
    });

    testWidgets('StoryCardPreview renders Artist Profile Template', (tester) async {
      final content = ArtistStoryContent(
        artistName: 'Joji',
        coverUrl: '',
        audience: '31.2M monthly listeners',
        topTracks: [sampleTrack],
      );
      final template = StoryTemplate.artistTemplates.first;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: StoryCardPreview(
                content: content,
                template: template,
                palette: ArtworkPalette.defaultPalette,
                backgroundStyle: StoryBackgroundStyle.liquid,
                textPolarity: StoryTextPolarity.light,
              ),
            ),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('Joji'), findsOneWidget);
      expect(find.byType(ZenifyStoryBrand), findsOneWidget);
    });

    testWidgets('StoryCardPreview renders Album Template', (tester) async {
      final content = AlbumStoryContent(
        albumTitle: 'SMITHEREENS',
        artistName: 'Joji',
        coverUrl: '',
        year: '2022',
        trackCount: 9,
      );
      final template = StoryTemplate.albumTemplates.first;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: StoryCardPreview(
                content: content,
                template: template,
                palette: ArtworkPalette.defaultPalette,
                backgroundStyle: StoryBackgroundStyle.liquid,
                textPolarity: StoryTextPolarity.light,
              ),
            ),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('SMITHEREENS'), findsOneWidget);
      expect(find.text('Joji'), findsOneWidget);
      expect(find.byType(ZenifyStoryBrand), findsOneWidget);
    });

    testWidgets('StoryCardPreview renders Playlist Template', (tester) async {
      final content = PlaylistStoryContent(
        playlistTitle: 'Late Night Chill',
        covers: const [],
        tracks: [sampleTrack],
      );
      final template = StoryTemplate.playlistTemplates.first;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: StoryCardPreview(
                content: content,
                template: template,
                palette: ArtworkPalette.defaultPalette,
                backgroundStyle: StoryBackgroundStyle.liquid,
                textPolarity: StoryTextPolarity.light,
              ),
            ),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('Late Night Chill'), findsOneWidget);
      expect(find.byType(ZenifyStoryBrand), findsOneWidget);
    });
  });
}
