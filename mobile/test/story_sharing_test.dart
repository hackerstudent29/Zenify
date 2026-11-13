import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/story_sharing/story_sharing.dart';
import 'package:mobile/models/track.dart';
import 'package:mobile/services/lyrics_service.dart';

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
    test('Story aspect ratios conform to 1080x1920 (9:16) and 1080x1080 (1:1)', () {
      const story = StoryAspectRatio.story;
      expect(story.width, equals(360.0));
      expect(story.height, equals(640.0));
      expect(story.exportWidth, equals(1080.0));
      expect(story.exportHeight, equals(1920.0));
      expect(story.ratio, closeTo(9 / 16, 0.001));

      const square = StoryAspectRatio.square;
      expect(square.width, equals(360.0));
      expect(square.height, equals(360.0));
      expect(square.exportWidth, equals(1080.0));
      expect(square.exportHeight, equals(1080.0));
      expect(square.ratio, equals(1.0));
    });

    test('All 5 story categories have >= 3 templates defined', () {
      for (final cat in StoryCategory.values) {
        final templates = StoryTemplate.templatesForCategory(cat);
        expect(templates.length, greaterThanOrEqualTo(3),
            reason: 'Category $cat must have at least 3 templates');
      }

      expect(StoryTemplate.songTemplates.length, equals(4)); // Classic, Full Poster, Liquid Glass, Editorial
      expect(StoryTemplate.lyricsTemplates.length, equals(3)); // Classic, Typography, Minimal
      expect(StoryTemplate.artistTemplates.length, equals(3)); // Profile, Editorial, Discography
      expect(StoryTemplate.albumTemplates.length, equals(3)); // Stacked, Editorial, Liquid
      expect(StoryTemplate.playlistTemplates.length, equals(3)); // Collage, Poster, Editorial Grid
    });

    test('StoryTemplate.byId resolves known IDs correctly', () {
      expect(StoryTemplate.byId('song_classic').id, equals('song_classic'));
      expect(StoryTemplate.byId('lyrics_classic').id, equals('lyrics_classic'));
      expect(StoryTemplate.byId('unknown_id').id, equals('song_classic'));
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

    testWidgets('StoryCardPreview renders Classic Song Template with Zenify brand and title', (tester) async {
      final content = SongStoryContent(track: sampleTrack);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: StoryCardPreview(
                content: content,
                template: StoryTemplate.songClassic,
                palette: ArtworkPalette.defaultPalette,
                backgroundStyle: StoryBackgroundStyle.artMesh,
                textPolarity: StoryTextPolarity.light,
                aspectRatio: StoryAspectRatio.story,
              ),
            ),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('Die For You'), findsOneWidget);
      expect(find.text('Joji'), findsOneWidget);
      expect(find.byType(ZenifyStoryBrand), findsOneWidget);
      expect(find.byType(Image), findsOneWidget);
    });

    testWidgets('StoryCardPreview renders Liquid Glass Song Template with waveform', (tester) async {
      final content = SongStoryContent(track: sampleTrack);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: StoryCardPreview(
                content: content,
                template: StoryTemplate.songLiquidGlass,
                palette: ArtworkPalette.defaultPalette,
                backgroundStyle: StoryBackgroundStyle.blurredCover,
                textPolarity: StoryTextPolarity.light,
                aspectRatio: StoryAspectRatio.story,
              ),
            ),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('Die For You'), findsOneWidget);
      expect(find.byType(ZenifyStoryBrand), findsOneWidget);
      expect(find.byType(Image), findsOneWidget);
    });

    testWidgets('StoryCardPreview renders Classic Lyrics Template with stacked lines', (tester) async {
      final content = LyricsStoryContent(
        track: sampleTrack,
        selectedLines: [
          "It's what I've always wanted",
          "Could never have too many of these",
        ],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: StoryCardPreview(
                content: content,
                template: StoryTemplate.lyricsClassic,
                palette: ArtworkPalette.defaultPalette,
                backgroundStyle: StoryBackgroundStyle.artMesh,
                textPolarity: StoryTextPolarity.light,
                aspectRatio: StoryAspectRatio.story,
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
      expect(find.byType(Image), findsOneWidget);
    });

    testWidgets('StoryCardPreview renders Artist Profile Template', (tester) async {
      final content = ArtistStoryContent(
        artistName: 'Joji',
        coverUrl: '',
        audience: '31.2M monthly listeners',
        topTracks: [sampleTrack],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: StoryCardPreview(
                content: content,
                template: StoryTemplate.artistProfile,
                palette: ArtworkPalette.defaultPalette,
                backgroundStyle: StoryBackgroundStyle.artMesh,
                textPolarity: StoryTextPolarity.light,
                aspectRatio: StoryAspectRatio.story,
              ),
            ),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('Joji'), findsOneWidget);
      expect(find.text('31.2M monthly listeners'), findsOneWidget);
      expect(find.byType(ZenifyStoryBrand), findsOneWidget);
      expect(find.byType(Image), findsOneWidget);
    });

    testWidgets('StoryCardPreview renders Stacked Album Template', (tester) async {
      final content = AlbumStoryContent(
        albumTitle: 'SMITHEREENS',
        artistName: 'Joji',
        coverUrl: '',
        year: '2022',
        trackCount: 9,
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: StoryCardPreview(
                content: content,
                template: StoryTemplate.albumStacked,
                palette: ArtworkPalette.defaultPalette,
                backgroundStyle: StoryBackgroundStyle.artMesh,
                textPolarity: StoryTextPolarity.light,
                aspectRatio: StoryAspectRatio.story,
              ),
            ),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('SMITHEREENS'), findsOneWidget);
      expect(find.text('Joji'), findsOneWidget);
      expect(find.textContaining('2022'), findsOneWidget);
      expect(find.byType(ZenifyStoryBrand), findsOneWidget);
      expect(find.byType(Image), findsOneWidget);
    });

    testWidgets('StoryCardPreview renders Collage Playlist Template', (tester) async {
      final content = PlaylistStoryContent(
        playlistTitle: 'Late Night Chill',
        covers: const [],
        owner: 'Curated by You',
        tracks: [sampleTrack],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: StoryCardPreview(
                content: content,
                template: StoryTemplate.playlistCollage,
                palette: ArtworkPalette.defaultPalette,
                backgroundStyle: StoryBackgroundStyle.artMesh,
                textPolarity: StoryTextPolarity.light,
                aspectRatio: StoryAspectRatio.story,
              ),
            ),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('Late Night Chill'), findsOneWidget);
      expect(find.textContaining('Curated by You'), findsOneWidget);
      expect(find.byType(ZenifyStoryBrand), findsOneWidget);
      expect(find.byType(Image), findsOneWidget);
    });

    testWidgets('Missing artwork and empty metadata do not crash any template', (tester) async {
      final emptyTrack = Track.empty();
      final content = SongStoryContent(track: emptyTrack);

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: StoryCardPreview(
                content: content,
                template: StoryTemplate.songClassic,
                palette: ArtworkPalette.defaultPalette,
                backgroundStyle: StoryBackgroundStyle.solidDark,
                textPolarity: StoryTextPolarity.light,
                aspectRatio: StoryAspectRatio.square,
              ),
            ),
          ),
        ),
      );
      await tester.pump();

      expect(find.byType(StoryCardPreview), findsOneWidget);
    });
  });

  group('LyricsSelectionScreen Selection Logic', () {
    final sampleLyrics = LyricsResult(
      synced: true,
      lines: [
        {'text': 'Line 1: I see the fire'},
        {'text': 'Line 2: Inside the mountain'},
        {'text': 'Line 3: I see fire'},
        {'text': 'Line 4: Burning the trees'},
        {'text': 'Line 5: And I hope that you remember me'},
      ],
      source: 'test',
    );

    testWidgets('Selects consecutive lines and enforces 3-line limit', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: LyricsSelectionScreen(
            track: sampleTrack,
            lyrics: sampleLyrics,
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Initially next button is disabled
      expect(find.text('Select up to 3 lines'), findsOneWidget);

      // Tap Line 1
      await tester.tap(find.text('Line 1: I see the fire'));
      await tester.pump();
      expect(find.text('Next (1 line)'), findsOneWidget);

      // Tap Line 2 (consecutive -> added)
      await tester.tap(find.text('Line 2: Inside the mountain'));
      await tester.pump();
      expect(find.text('Next (2 lines)'), findsOneWidget);

      // Tap Line 3 (consecutive -> added)
      await tester.tap(find.text('Line 3: I see fire'));
      await tester.pump();
      expect(find.text('Next (3 lines)'), findsOneWidget);

      // Attempt to tap Line 4 (>3 lines -> toast and still 3 lines)
      await tester.tap(find.text('Line 4: Burning the trees'));
      await tester.pump();
      expect(find.text('Next (3 lines)'), findsOneWidget);

      // Tap Line 5 (non-consecutive -> resets selection to only Line 5!)
      await tester.tap(find.text('Line 5: And I hope that you remember me'));
      await tester.pump();
      expect(find.text('Next (1 line)'), findsOneWidget);
    });

    testWidgets('Shows empty state when lyrics are null or empty', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: LyricsSelectionScreen(
            track: sampleTrack,
            lyrics: null,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('No Lyrics Available'), findsOneWidget);
      expect(find.text('Share Song Instead'), findsOneWidget);
    });
  });
}

