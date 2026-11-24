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

      final allUniqueRemaining = {
        if (result.topResult != null) result.topResult!.item.id,
        ...result.songs.map((s) => s.id),
      };
      expect(allUniqueRemaining.length, equals(1));
      expect(result.songs.length, equals(1));
      expect(result.songs.first.musicVideoType, equals('ATV'));
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

  group('8. Native Summary Parsing & Failsafe Tests', () {
    test('parses Android native summary list correctly into Top Result and categorized items', () {
      final nativeFixture = [
        {
          'title': 'Top result',
          'items': [
            {
              'type': 'artist',
              'id': 'UC_anirudh',
              'channelId': 'UC_anirudh',
              'title': 'Anirudh Ravichander',
              'thumbnail': 'https://lh3.googleusercontent.com/avatar=s544',
            }
          ],
        },
        {
          'title': 'Songs',
          'items': [
            {
              'type': 'song',
              'id': 'video12345',
              'title': 'Hukum',
              'artists': [
                {'id': 'a1', 'name': 'Anirudh Ravichander'}
              ],
              'album': {'id': 'alb1', 'name': 'Jailer'},
              'duration': 207,
              'thumbnail': 'https://lh3.googleusercontent.com/cover=s544',
              'explicit': false,
            }
          ],
        },
        {
          'title': 'Albums',
          'items': [
            {
              'type': 'album',
              'id': 'alb1',
              'browseId': 'MPREb_123',
              'playlistId': 'OLAK5uy_123',
              'title': 'Jailer',
              'artists': [
                {'id': 'a1', 'name': 'Anirudh Ravichander'}
              ],
              'year': 2023,
              'thumbnail': 'https://lh3.googleusercontent.com/cover=s544',
            }
          ],
        }
      ];

      final payload = SearchParser.parseNativeSummaries(nativeFixture, query: 'anirudh');
      expect(payload.topResult, isNotNull);
      expect(payload.topResult!.title, equals('Anirudh Ravichander'));
      expect(payload.topResult!.type, equals(SearchItemType.artist));
      expect(payload.items.length, equals(3));

      final song = payload.items.whereType<SearchSongItem>().first;
      expect(song.title, equals('Hukum'));
      expect(song.albumName, equals('Jailer'));
      expect(song.durationText, equals('3:27'));

      final album = payload.items.whereType<SearchAlbumItem>().first;
      expect(album.title, equals('Jailer'));
      expect(album.year, equals(2023));
    });

    test('DEBUG: ganesh songs search returns results', () {
      final nativeFixture = [
        {
          'title': 'Top result',
          'items': [
            {
              'type': 'song',
              'id': 's1',
              'title': 'Ganesha Pancharatnam',
              'artists': [
                {'id': 'a1', 'name': 'SPB'}
              ],
              'duration': 300,
              'thumbnail': 'https://lh3.googleusercontent.com/cover=s544',
            }
          ]
        },
        {
          'title': 'Songs',
          'items': [
            {
              'type': 'song',
              'id': 's2',
              'title': 'Maha Ganapathim',
              'artists': [
                {'id': 'a2', 'name': 'K. J. Yesudas'}
              ],
              'duration': 280,
              'thumbnail': 'https://lh3.googleusercontent.com/cover=s544',
            }
          ]
        }
      ];

      final payload = SearchParser.parseNativeSummaries(nativeFixture, query: 'ganesh songs');
      final intent = SearchIntentDetector.detectIntent('ganesh songs', payload.items);
      final res = SearchRanker.rank(
        items: payload.items,
        intent: intent,
        countryCode: 'IN',
        initialTopResult: payload.topResult,
      );
      expect(res.isEmpty, isFalse);
    });
  });

  group('9. Parity, RRF, Two-Layer Caching, and Non-Destructive Phonetics', () {
    test('non-destructive phonetics: preserves international names without destructive replacements', () {
      // Zhavia should NOT become lavia (zh -> l was removed)
      final zhaviaKey = QueryPreprocessor.phoneticKey('Zhavia');
      final laviaKey = QueryPreprocessor.phoneticKey('Lavia');
      expect(zhaviaKey, isNot(equals(laviaKey)));

      // David Guetta should NOT become Dawid (v -> w was removed)
      final davidKey = QueryPreprocessor.phoneticKey('David');
      final dawidKey = QueryPreprocessor.phoneticKey('Dawid');
      expect(davidKey, isNot(equals(dawidKey)));

      // Vance Joy should NOT become Wance (v -> w was removed)
      final vanceKey = QueryPreprocessor.phoneticKey('Vance');
      final wanceKey = QueryPreprocessor.phoneticKey('Wance');
      expect(vanceKey, isNot(equals(wanceKey)));

      // The Weeknd: vowel collapses ee -> i and duplicate letters
      final weekndKey = QueryPreprocessor.phoneticKey('The Weeknd');
      expect(weekndKey, contains('wiknd'));
    });

    test('multi-stream RRF and Provider Rank preservation', () {
      final highRankItem = SearchSongItem(
        id: 'stream-high',
        title: 'Song Alpha',
        subtitle: 'Artist Name',
        thumbnailUrl: 'https://example.com/1.jpg',
        thumbnailUrlHiRes: 'https://example.com/1_hi.jpg',
        providerRank: 0, // Top ranked by InnerTube provider
        sourceStream: 'general',
      );

      final lowRankItem = SearchSongItem(
        id: 'stream-low',
        title: 'Song Beta',
        subtitle: 'Artist Name',
        thumbnailUrl: 'https://example.com/2.jpg',
        thumbnailUrlHiRes: 'https://example.com/2_hi.jpg',
        providerRank: 15, // Ranked 15th by provider
        sourceStream: 'general',
      );

      final intent = SearchIntentDetector.detectIntent('song', [highRankItem, lowRankItem]);
      final result = SearchRanker.rank(
        items: [lowRankItem, highRankItem],
        intent: intent,
        countryCode: 'US',
      );

      // Higher provider rank wins
      expect(result.songs.first.id, equals('stream-high'));
      // Diagnostics must be present
      expect(result.diagnostics, isNotNull);
      expect(
        result.diagnostics!.candidateBreakdowns.any((c) => c.id == 'stream-high'),
        isTrue,
      );
      final diag = result.diagnostics!.candidateBreakdowns.firstWhere((c) => c.id == 'stream-high');
      expect(diag.rrfScore, greaterThan(0));
      expect(diag.finalScore, greaterThan(0));
    });

    test('two-layer caching: Layer A raw cache vs Layer B personalized LRU cache isolation', () {
      // 1. Layer A Raw Provider Cache
      final rawCache = SearchRawProviderCache(capacity: 5);
      final rawKey1 = SearchRawProviderCache.buildKey(
        query: 'coldplay',
        stream: 'general',
        country: 'US',
        language: 'en',
      );
      final rawKey2 = SearchRawProviderCache.buildKey(
        query: 'coldplay',
        stream: 'artists',
        country: 'US',
        language: 'en',
      );

      expect(rawCache.get(rawKey1), isNull);
      rawCache.put(rawKey1, {'status': 'ok', 'stream': 'general'});
      expect(rawCache.get(rawKey1), isNotNull);
      expect(rawCache.get(rawKey2), isNull);

      // 2. Layer B Personalized Cache with profileHash isolation
      final lruCache = SearchLruCache(capacity: 10);
      final userAKey = SearchLruCache.buildKey(
        query: 'vibe',
        country: 'IN',
        language: 'en',
        profileHash: 'ta,te:Anirudh',
      );
      final userBKey = SearchLruCache.buildKey(
        query: 'vibe',
        country: 'IN',
        language: 'en',
        profileHash: 'hi,pa:Arijit',
      );

      expect(userAKey, isNot(equals(userBKey)));
      final dummyResult = SearchResult(
        originalQuery: 'vibe',
        intent: const SearchIntent(originalQuery: 'vibe', normalizedQuery: 'vibe', entityText: 'vibe'),
      );
      lruCache.put(userAKey, dummyResult);
      expect(lruCache.get(userAKey), isNotNull);
      expect(lruCache.get(userBKey), isNull); // User B does not get User A's personalized cache
    });

    test('cardinal rule: exact international song title match is never beaten by regional/fav artist boost', () {
      final exactIntlSong = SearchSongItem(
        id: 'song-blinding-lights',
        title: 'Blinding Lights',
        subtitle: 'The Weeknd • After Hours',
        thumbnailUrl: 'https://example.com/bl.jpg',
        thumbnailUrlHiRes: 'https://example.com/bl_hi.jpg',
        artists: [const ArtistRef(id: 'weeknd', name: 'The Weeknd')],
        providerRank: 0,
      );

      final regionalDistractor = SearchSongItem(
        id: 'song-tamil-lights',
        title: 'Lights Festival Tamil Song',
        subtitle: 'Anirudh Ravichander',
        thumbnailUrl: 'https://example.com/lights.jpg',
        thumbnailUrlHiRes: 'https://example.com/lights_hi.jpg',
        artists: [const ArtistRef(id: 'anirudh', name: 'Anirudh Ravichander')],
        providerRank: 3,
      );

      final intent = SearchIntentDetector.detectIntent('blinding lights', [exactIntlSong, regionalDistractor]);
      // User has extreme regional preference (IN, Tamil preferred, Anirudh favorite)
      final result = SearchRanker.rank(
        items: [regionalDistractor, exactIntlSong],
        intent: intent,
        countryCode: 'IN',
        preferredLanguages: ['ta', 'te'],
        favoriteArtists: ['Anirudh Ravichander'],
      );

      // Despite user's favorite artist being Anirudh in India, "Blinding Lights" MUST rank #1
      expect(result.topResult?.item.id ?? result.songs.first.id, equals('song-blinding-lights'));
    });
  });

  group('10. Parity and Video Music Filtering', () {
    test('filters non-music spam videos while preserving legitimate music video songs', () {
      final song = SearchSongItem(
        id: 'song-starboy',
        title: 'Starboy',
        subtitle: 'The Weeknd • Daft Punk',
        thumbnailUrl: 'https://example.com/starboy.jpg',
        thumbnailUrlHiRes: 'https://example.com/starboy_hi.jpg',
        artists: [const ArtistRef(id: 'weeknd', name: 'The Weeknd')],
        providerRank: 0,
        musicVideoType: 'ATV',
      );

      final legitMusicVideo = SearchVideoItem(
        id: 'video-starboy-mv',
        title: 'Starboy (Official Music Video)',
        subtitle: 'The Weeknd • 2.5B views',
        thumbnailUrl: 'https://example.com/starboy_mv.jpg',
        thumbnailUrlHiRes: 'https://example.com/starboy_mv_hi.jpg',
        channel: 'TheWeekndVEVO',
        durationText: '3:50',
        views: 2500000000,
      );

      final nonMusicReview = SearchVideoItem(
        id: 'video-tech-review',
        title: 'Starboy Sound & Audio Tech Review',
        subtitle: 'Gadget Guru • 10K views',
        thumbnailUrl: 'https://example.com/review.jpg',
        thumbnailUrlHiRes: 'https://example.com/review_hi.jpg',
        channel: 'Gadget Guru',
        durationText: '12:45',
        views: 10000,
      );

      final intent = SearchIntentDetector.detectIntent('starboy', [song, legitMusicVideo, nonMusicReview]);
      final result = SearchRanker.rank(
        items: [nonMusicReview, song, legitMusicVideo],
        intent: intent,
        countryCode: 'US',
      );

      // Tech review video is filtered out
      expect(result.videos.any((v) => v.id == 'video-tech-review'), isFalse);
      // Legitimate music video song is preserved in videos section!
      expect(result.videos.any((v) => v.id == 'video-starboy-mv'), isTrue);
      expect(result.songs.any((s) => s.id == 'song-starboy'), isTrue);
    });

    test('YouTube Music verified initialTopResult is honored as Top Result', () {
      final artistItem = SearchArtistItem(
        id: 'artist-weeknd',
        title: 'The Weeknd',
        subtitle: 'Artist • 54M subscribers',
        thumbnailUrl: 'https://example.com/weeknd.jpg',
        thumbnailUrlHiRes: 'https://example.com/weeknd_hi.jpg',
        browseId: 'UC_weeknd',
        isVerified: true,
      );

      final songItem = SearchSongItem(
        id: 'song-weeknd-hills',
        title: 'The Hills',
        subtitle: 'The Weeknd',
        thumbnailUrl: 'https://example.com/hills.jpg',
        thumbnailUrlHiRes: 'https://example.com/hills_hi.jpg',
        artists: [const ArtistRef(id: 'weeknd', name: 'The Weeknd')],
        providerRank: 0,
      );

      final topResultCard = SearchTopResult(item: artistItem);
      final intent = SearchIntentDetector.detectIntent('the weeknd', [artistItem, songItem]);
      final result = SearchRanker.rank(
        items: [songItem, artistItem],
        intent: intent,
        countryCode: 'US',
        initialTopResult: topResultCard,
      );

      expect(result.topResult, isNotNull);
      expect(result.topResult!.item.id, equals('artist-weeknd'));
    });
  });
}
