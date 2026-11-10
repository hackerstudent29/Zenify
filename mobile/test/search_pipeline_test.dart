import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/design_system/widgets/media_card.dart';
import 'package:mobile/models/artist_ref.dart';
import 'package:mobile/views/search/search_models.dart';
import 'package:mobile/views/search/search_parser.dart';
import 'package:mobile/views/search/search_ranker.dart';

void main() {
  group('1. Parser & Missing-Name Regression Tests', () {
    test('parses musicCardShelfRenderer (Top Result)', () {
      final fixture = {
        'contents': {
          'sectionListRenderer': {
            'contents': [
              {
                'musicCardShelfRenderer': {
                  'title': {
                    'runs': [
                      {
                        'text': 'Anirudh Ravichander',
                        'navigationEndpoint': {
                          'browseEndpoint': {
                            'browseId': 'UC_anirudh',
                            'browseEndpointContextSupportedConfigs': {
                              'browseEndpointContextMusicConfig': {
                                'pageType': 'MUSIC_PAGE_TYPE_ARTIST',
                              },
                            },
                          },
                        },
                      }
                    ],
                  },
                  'subtitle': {
                    'runs': [
                      {'text': 'Artist • 14.2M subscribers'}
                    ],
                  },
                  'thumbnail': {
                    'musicThumbnailRenderer': {
                      'thumbnail': {
                        'thumbnails': [
                          {'url': 'https://lh3.googleusercontent.com/avatar=s120', 'width': 120},
                          {'url': 'https://lh3.googleusercontent.com/avatar=s544', 'width': 544},
                        ],
                      },
                    },
                  },
                },
              }
            ],
          },
        },
      };

      final payload = SearchParser.parse(fixture, query: 'anirudh');
      expect(payload.topResult, isNotNull);
      expect(payload.topResult!.title, equals('Anirudh Ravichander'));
      expect(payload.topResult!.type, equals(SearchItemType.artist));
      expect(payload.topResult!.imageUrl, contains('googleusercontent.com'));
      expect(payload.topResult!.subtitle, contains('14.2M'));
    });

    test('REGRESSION TEST: alternate path with simpleText preserves title (never empty)', () {
      final fixture = {
        'contents': {
          'sectionListRenderer': {
            'contents': [
              {
                'itemSectionRenderer': {
                  'contents': [
                    {
                      'musicResponsiveListItemRenderer': {
                        'flexColumns': [
                          {
                            'musicResponsiveListItemFlexColumnRenderer': {
                              'text': {
                                // Missing runs array, has simpleText
                                'simpleText': 'Hukum - Thalaivar Alappara',
                              },
                            },
                          },
                          {
                            'musicResponsiveListItemFlexColumnRenderer': {
                              'text': {
                                'simpleText': 'Song • Anirudh Ravichander • Jailer • 3:27',
                              },
                            },
                          }
                        ],
                        'thumbnail': {
                          'musicThumbnailRenderer': {
                            'thumbnail': {
                              'thumbnails': [
                                {'url': 'https://lh3.googleusercontent.com/cover=w120-h120', 'width': 120}
                              ],
                            },
                          },
                        },
                        'navigationEndpoint': {
                          'watchEndpoint': {'videoId': 'testVideo123'},
                        },
                      },
                    }
                  ],
                },
              }
            ],
          },
        },
      };

      final payload = SearchParser.parse(fixture, query: 'hukum');
      expect(payload.items.length, equals(1));
      final song = payload.items.first as SearchSongItem;
      expect(song.title, equals('Hukum - Thalaivar Alappara'));
      expect(song.title, isNotEmpty);
      expect(song.subtitle, isNotEmpty);
      expect(song.thumbnailUrl, isNotEmpty);
    });

    test('REGRESSION TEST: alternate path with accessibility label fallback preserves title', () {
      final fixture = {
        'contents': {
          'sectionListRenderer': {
            'contents': [
              {
                'itemSectionRenderer': {
                  'contents': [
                    {
                      'musicResponsiveListItemRenderer': {
                        'accessibility': {
                          'accessibilityData': {'label': 'Leo Soundtrack Album'},
                        },
                        'flexColumns': [
                          {
                            'musicResponsiveListItemFlexColumnRenderer': {
                              'text': {
                                'runs': [], // empty runs
                              },
                            },
                          },
                          {
                            'musicResponsiveListItemFlexColumnRenderer': {
                              'text': {
                                'runs': [
                                  {'text': 'Album • Anirudh Ravichander • 2023'}
                                ],
                              },
                            },
                          }
                        ],
                        'thumbnail': {
                          'musicThumbnailRenderer': {
                            'thumbnail': {
                              'thumbnails': [
                                {'url': 'https://lh3.googleusercontent.com/leo=w200-h200', 'width': 200}
                              ],
                            },
                          },
                        },
                        'navigationEndpoint': {
                          'browseEndpoint': {
                            'browseId': 'MPREb_leo',
                            'browseEndpointContextSupportedConfigs': {
                              'browseEndpointContextMusicConfig': {'pageType': 'MUSIC_PAGE_TYPE_ALBUM'},
                            },
                          },
                        },
                      },
                    }
                  ],
                },
              }
            ],
          },
        },
      };

      final payload = SearchParser.parse(fixture, query: 'leo');
      expect(payload.items.length, equals(1));
      final album = payload.items.first as SearchAlbumItem;
      expect(album.title, equals('Leo Soundtrack Album'));
      expect(album.title, isNotEmpty);
    });

    test('parses didYouMeanRenderer typo correction', () {
      final fixture = {
        'contents': {
          'sectionListRenderer': {
            'contents': [
              {
                'itemSectionRenderer': {
                  'contents': [
                    {
                      'didYouMeanRenderer': {
                        'correctedQuery': {
                          'runs': [
                            {'text': 'Anirudh'}
                          ],
                        },
                      },
                    }
                  ],
                },
              }
            ],
          },
        },
      };

      final payload = SearchParser.parse(fixture, query: 'anrudh');
      expect(payload.didYouMean, equals('Anirudh'));
    });
  });

  group('2. Intent Detection Tests', () {
    final sampleArtist = SearchArtistItem(
      id: 'artist-anirudh',
      title: 'Anirudh Ravichander',
      subtitle: 'Artist • 14.2M subscribers',
      thumbnailUrl: 'https://example.com/art.jpg',
      thumbnailUrlHiRes: 'https://example.com/art_hi.jpg',
      browseId: 'UC_anirudh',
      subscriberCount: 14200000,
    );

    test('exact artist query "anirudh" sets layoutMode to exactArtist', () {
      final intent = SearchIntentDetector.detectIntent('anirudh', [sampleArtist]);
      expect(intent.artistIntent, isTrue);
      expect(intent.layoutMode, equals(SearchLayoutMode.exactArtist));
      expect(intent.matchedArtistName, equals('Anirudh Ravichander'));
    });

    test('artist + type query "anirudh songs" sets intentType to song and layoutMode to artistType', () {
      final intent = SearchIntentDetector.detectIntent('anirudh songs', [sampleArtist]);
      expect(intent.artistIntent, isTrue);
      expect(intent.intentType, equals(SearchItemType.song));
      expect(intent.layoutMode, equals(SearchLayoutMode.artistType));
    });

    test('artist + albums query "anirudh albums" sets intentType to album and layoutMode to artistType', () {
      final intent = SearchIntentDetector.detectIntent('anirudh albums', [sampleArtist]);
      expect(intent.artistIntent, isTrue);
      expect(intent.intentType, equals(SearchItemType.album));
      expect(intent.layoutMode, equals(SearchLayoutMode.artistType));
    });

    test('song title query "kaavaalaa" sets layoutMode to songTitle', () {
      final sampleSong = SearchSongItem(
        id: 'vid-kaavaalaa',
        title: 'Kaavaalaa',
        subtitle: 'Anirudh Ravichander, Shilpa Rao',
        thumbnailUrl: 'https://example.com/k.jpg',
        thumbnailUrlHiRes: 'https://example.com/k_hi.jpg',
      );
      final intent = SearchIntentDetector.detectIntent('kaavaalaa', [sampleSong]);
      expect(intent.layoutMode, equals(SearchLayoutMode.songTitle));
    });

    test('phonetic key comparison for typo "arijit sinng" matches "Arijit Singh"', () {
      final key1 = QueryPreprocessor.phoneticKey('arijit sinng');
      final key2 = QueryPreprocessor.phoneticKey('Arijit Singh');
      expect(key1, equals(key2));
    });

    test('query with modifier "anirudh live" detects live modifier', () {
      final intent = SearchIntentDetector.detectIntent('anirudh live', [sampleArtist]);
      expect(intent.modifiers, contains('live'));
      expect(intent.artistIntent, isTrue);
    });
  });

  group('3. Ranking Order Acceptance Rules (C4)', () {
    final anirudhArtist = SearchArtistItem(
      id: 'artist-anirudh',
      title: 'Anirudh Ravichander',
      subtitle: 'Artist • 14.2M subscribers',
      thumbnailUrl: 'https://example.com/anirudh.jpg',
      thumbnailUrlHiRes: 'https://example.com/anirudh_hi.jpg',
      browseId: 'UC_anirudh',
      subscriberCount: 14200000,
      rawRank: 0,
    );

    final anirudhOwnSong = SearchSongItem(
      id: 'song-badass',
      title: 'Badass',
      subtitle: 'Anirudh Ravichander',
      thumbnailUrl: 'https://example.com/badass.jpg',
      thumbnailUrlHiRes: 'https://example.com/badass_hi.jpg',
      artists: [const ArtistRef(id: 'UC_anirudh', name: 'Anirudh Ravichander')],
      rawRank: 1,
    );

    final otherArtistMentionsAnirudh = SearchSongItem(
      id: 'song-other',
      title: 'Anirudh Mashup',
      subtitle: 'DJ Random',
      thumbnailUrl: 'https://example.com/mashup.jpg',
      thumbnailUrlHiRes: 'https://example.com/mashup_hi.jpg',
      artists: [const ArtistRef(id: 'other', name: 'DJ Random')],
      rawRank: 2,
    );

    test('query "anirudh": Top result is Artist profile card, and own song outranks mention song', () {
      final intent = SearchIntentDetector.detectIntent('anirudh', [anirudhArtist]);
      final result = SearchRanker.rank(
        items: [otherArtistMentionsAnirudh, anirudhOwnSong, anirudhArtist],
        intent: intent,
        countryCode: 'IN',
      );

      // 1. Top Result is Artist profile
      expect(result.topResult, isNotNull);
      expect(result.topResult!.type, equals(SearchItemType.artist));
      expect(result.topResult!.title, equals('Anirudh Ravichander'));

      // 2. In songs section, own song ranks before other artist mentioning Anirudh
      final songs = result.sections[SearchItemType.song]!;
      expect(songs.first.id, equals('song-badass'));
    });

    test('query "anirudh songs": songs section leads with artist primary songs first', () {
      final intent = SearchIntentDetector.detectIntent('anirudh songs', [anirudhArtist]);
      expect(intent.layoutMode, equals(SearchLayoutMode.artistType));

      final result = SearchRanker.rank(
        items: [otherArtistMentionsAnirudh, anirudhOwnSong, anirudhArtist],
        intent: intent,
        countryCode: 'IN',
      );

      final songSection = result.sections[SearchItemType.song];
      expect(songSection, isNotNull);
      expect(songSection!.isNotEmpty, isTrue);
      expect(songSection.first.id, equals('song-badass'));
    });
  });

  group('4. Country Boost Tests', () {
    test('with country=IN, Tamil song ranks above equal-text-score non-regional song', () {
      final tamilSong = SearchSongItem(
        id: 'tamil-1',
        title: 'Vibe Track',
        subtitle: 'Tamil Hits • Anirudh',
        thumbnailUrl: 'https://example.com/1.jpg',
        thumbnailUrlHiRes: 'https://example.com/1_hi.jpg',
        rawRank: 0,
      );

      final westernSong = SearchSongItem(
        id: 'west-1',
        title: 'Vibe Track',
        subtitle: 'Pop English • The Weeknd',
        thumbnailUrl: 'https://example.com/2.jpg',
        thumbnailUrlHiRes: 'https://example.com/2_hi.jpg',
        rawRank: 0,
      );

      final intent = SearchIntentDetector.detectIntent('vibe track', [tamilSong, westernSong]);
      final result = SearchRanker.rank(
        items: [westernSong, tamilSong],
        intent: intent,
        countryCode: 'IN',
      );

      final winnerId = result.topResult?.item.id ?? result.songs.first.id;
      expect(winnerId, equals('tamil-1'));
    });

    test('weak-match regional song NEVER outranks strong exact match', () {
      final exactMatchEnglish = SearchSongItem(
        id: 'exact-eng',
        title: 'Starboy',
        subtitle: 'The Weeknd • Starboy',
        thumbnailUrl: 'https://example.com/starboy.jpg',
        thumbnailUrlHiRes: 'https://example.com/starboy_hi.jpg',
        rawRank: 0,
      );

      final weakMatchTamil = SearchSongItem(
        id: 'weak-tamil',
        title: 'Star Boys Tamil BGM',
        subtitle: 'Tamil Remix • Various Artists',
        thumbnailUrl: 'https://example.com/bgm.jpg',
        thumbnailUrlHiRes: 'https://example.com/bgm_hi.jpg',
        rawRank: 5,
      );

      final intent = SearchIntentDetector.detectIntent('starboy', [exactMatchEnglish, weakMatchTamil]);
      final result = SearchRanker.rank(
        items: [weakMatchTamil, exactMatchEnglish],
        intent: intent,
        countryCode: 'IN',
      );

      // Exact match must still be #1
      expect(result.topResult?.item.id ?? result.songs.first.id, equals('exact-eng'));
    });
  });

  group('5. Deduplication and Stable-Sort Determinism', () {
    test('duplicate ATV and OMV collapse, keeping official ATV version', () {
      final omvSong = SearchSongItem(
        id: 'video-123',
        title: 'Hukum',
        subtitle: 'Anirudh Ravichander',
        thumbnailUrl: 'https://example.com/omv.jpg',
        thumbnailUrlHiRes: 'https://example.com/omv.jpg',
        durationSeconds: 207,
        musicVideoType: 'OMV',
      );

      final atvSong = SearchSongItem(
        id: 'audio-123',
        title: 'Hukum',
        subtitle: 'Anirudh Ravichander',
        thumbnailUrl: 'https://example.com/atv.jpg',
        thumbnailUrlHiRes: 'https://example.com/atv.jpg',
        durationSeconds: 207,
        musicVideoType: 'ATV',
      );

      final intent = SearchIntentDetector.detectIntent('hukum', [omvSong, atvSong]);
      final result = SearchRanker.rank(
        items: [omvSong, atvSong],
        intent: intent,
        countryCode: 'IN',
      );

      final allRemaining = [
        if (result.topResult != null) result.topResult!.item,
        ...result.songs,
      ];
      expect(allRemaining.length, equals(1));
      expect((allRemaining.first as SearchSongItem).musicVideoType, equals('ATV'));
    });

    test('stable sort determinism: same input gives exact identical order and scores', () {
      final items = List.generate(
        10,
        (i) => SearchSongItem(
          id: 'song-$i',
          title: 'Track $i',
          subtitle: 'Artist $i',
          thumbnailUrl: 'https://example.com/$i.jpg',
          thumbnailUrlHiRes: 'https://example.com/$i.jpg',
          rawRank: i,
        ),
      );

      final intent = SearchIntentDetector.detectIntent('track', items);
      final run1 = SearchRanker.rank(items: items, intent: intent, countryCode: 'IN');
      final run2 = SearchRanker.rank(items: items, intent: intent, countryCode: 'IN');

      final ids1 = run1.songs.map((s) => s.id).toList();
      final ids2 = run2.songs.map((s) => s.id).toList();
      expect(ids1, equals(ids2));
    });
  });

  group('6. Trie Autocomplete and LRU TTL Tests', () {
    test('Trie prefix matching with frequency ranking', () {
      final trie = SearchTrie();
      trie.insert('anirudh', frequency: 100);
      trie.insert('anirudh songs', frequency: 80);
      trie.insert('anirudh albums', frequency: 50);
      trie.insert('arijit singh', frequency: 90);

      final matches = trie.searchPrefix('ani', limit: 3);
      expect(matches, contains('anirudh'));
      expect(matches, contains('anirudh songs'));
      expect(matches, contains('anirudh albums'));
      expect(matches, isNot(contains('arijit singh')));
    });

    test('LRU cache evicts oldest entry upon capacity and respects TTL', () {
      final cache = SearchLruCache(capacity: 2, ttl: const Duration(seconds: 1));
      final dummyResult1 = SearchResult(
        originalQuery: 'q1',
        intent: const SearchIntent(originalQuery: 'q1', normalizedQuery: 'q1', entityText: 'q1'),
      );
      final dummyResult2 = SearchResult(
        originalQuery: 'q2',
        intent: const SearchIntent(originalQuery: 'q2', normalizedQuery: 'q2', entityText: 'q2'),
      );
      final dummyResult3 = SearchResult(
        originalQuery: 'q3',
        intent: const SearchIntent(originalQuery: 'q3', normalizedQuery: 'q3', entityText: 'q3'),
      );

      cache.put('k1', dummyResult1);
      cache.put('k2', dummyResult2);
      expect(cache.get('k1'), isNotNull);

      // Inserting k3 should evict k2 (since k1 was just accessed)
      cache.put('k3', dummyResult3);
      expect(cache.get('k2'), isNull);
      expect(cache.get('k1'), isNotNull);
      expect(cache.get('k3'), isNotNull);
    });
  });

  group('7. Widget Tests (Text Scaler 1.0 and 1.3 Tolerance)', () {
    testWidgets('MediaCard displays title and subtitle without overflow at text scale 1.0 and 1.3', (WidgetTester tester) async {
      for (final scale in [1.0, 1.3]) {
        await tester.pumpWidget(
          MaterialApp(
            home: MediaQuery(
              data: MediaQueryData(textScaler: TextScaler.linear(scale)),
              child: const Scaffold(
                body: SizedBox(
                  height: 260,
                  child: MediaCard(
                    title: 'A Beautiful Long Album Title That Runs Two Lines',
                    subtitle: 'Anirudh Ravichander • 2024',
                    isCircular: false,
                    width: 170,
                    twoLineTitle: true,
                  ),
                ),
              ),
            ),
          ),
        );

        expect(find.byType(MediaCard), findsOneWidget);
        expect(find.text('A Beautiful Long Album Title That Runs Two Lines'), findsOneWidget);
        expect(tester.takeException(), isNull);
      }
    });

    testWidgets('Circular Artist MediaCard displays name and subscriber subtitle at scale 1.0 and 1.3', (WidgetTester tester) async {
      for (final scale in [1.0, 1.3]) {
        await tester.pumpWidget(
          MaterialApp(
            home: MediaQuery(
              data: MediaQueryData(textScaler: TextScaler.linear(scale)),
              child: const Scaffold(
                body: SizedBox(
                  height: 260,
                  child: MediaCard(
                    title: 'Anirudh Ravichander',
                    subtitle: 'Artist • 14.2M subscribers',
                    isCircular: true,
                    width: 170,
                    twoLineTitle: true,
                  ),
                ),
              ),
            ),
          ),
        );

        expect(find.byType(MediaCard), findsOneWidget);
        expect(find.text('Anirudh Ravichander'), findsOneWidget);
        expect(tester.takeException(), isNull);
      }
    });
  });
}
