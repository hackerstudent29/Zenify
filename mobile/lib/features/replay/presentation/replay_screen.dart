import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/models/playback_context.dart';
import 'package:mobile/models/track.dart';
import 'package:mobile/services/library_store.dart';
import 'package:mobile/services/listening_history_service.dart';
import 'package:mobile/services/player_state.dart';
import 'package:mobile/views/insights/widgets/history_view.dart';
import '../data/all_time_index_store.dart';
import '../data/exclusion_store.dart';
import '../data/replay_journal_reader.dart';
import '../data/track_meta_store.dart';
import '../domain/all_time_index.dart';
import '../domain/listen_event.dart';
import '../domain/replay_aggregate.dart';
import '../domain/replay_engine.dart';
import '../domain/replay_period.dart';
import '../domain/services/replay_archive_service.dart';
import '../domain/services/replay_match_service.dart';
import 'archive/replay_archive_sheet.dart';
import 'quiz/replay_quiz_screen.dart';
import 'social/dedicate_song_sheet.dart';
import 'social/replay_match_screen.dart';
import 'story/story_walkthrough_screen.dart';
import 'widgets/completion_focus_card.dart';
import 'widgets/composers_singers_section.dart';
import 'widgets/created_playlists_section.dart';
import 'widgets/day_of_week_card.dart';
import 'widgets/daypart_card.dart';
import 'widgets/decades_breakdown_section.dart';
import 'widgets/discovery_section.dart';
import 'widgets/first_song_card.dart';
import 'widgets/heatmap_calendar.dart';
import 'widgets/languages_bar_card.dart';
import 'widgets/liked_songs_spotlight.dart';
import 'widgets/listener_personality_card.dart';
import 'widgets/loyalty_timeline_card.dart';
import 'widgets/marathon_session_card.dart';
import 'widgets/milestone_moments_card.dart';
import 'widgets/milestones_trophy_room.dart';
import 'widgets/music_geography_section.dart';
import 'widgets/offline_data_saved_card.dart';
import 'widgets/on_repeat_section.dart';
import 'widgets/period_delta_pill.dart';
import 'widgets/private_listening_sheet.dart';
import 'widgets/skip_hall_of_fame_card.dart';
import 'widgets/top_album_card.dart';
import 'widgets/top_artists_section.dart';
import 'widgets/top_songs_section.dart';

/// The Master Zenify Replay & Insights Screen.
///
/// Implements Phase 8 architecture:
/// - Fixed header clearance (pt-24 / 96px top padding, no negative margins).
/// - Sticky/top Period Selector (Week, Month, Year, Archive).
/// - Pull-to-refresh for real-time recalculation.
/// - Full suite of verified widgets (F1 - F26).
class ReplayScreen extends StatefulWidget {
  const ReplayScreen({
    super.key,
    this.initialPeriodKind = PeriodKind.month,
    this.customPeriod,
    this.journalFile,
    this.allTimeIndex,
    this.metaStore,
    this.archiveService,
    this.onPlaySong,
    this.onPlayMix,
    this.onOpenStory,
    this.onOpenQuiz,
    this.onOpenMatch,
  });

  final PeriodKind initialPeriodKind;
  final ReplayPeriod? customPeriod;
  final File? journalFile;
  final AllTimeIndex? allTimeIndex;
  final TrackMetaStore? metaStore;
  final ReplayArchiveService? archiveService;
  final ValueChanged<SongStat>? onPlaySong;
  final ValueChanged<List<SongStat>>? onPlayMix;
  final VoidCallback? onOpenStory;
  final VoidCallback? onOpenQuiz;
  final VoidCallback? onOpenMatch;

  @override
  State<ReplayScreen> createState() => _ReplayScreenState();
}

class _ReplayScreenState extends State<ReplayScreen> {
  late PeriodKind _selectedKind;
  late DateTime _referenceNow;

  bool _isLoading = true;
  String? _errorMessage;
  ReplayAggregate? _aggregate;
  ReplayAggregate? _previousAggregate;
  AllTimeIndex? _allTimeIndex;

  @override
  void initState() {
    super.initState();
    _selectedKind = widget.initialPeriodKind;
    _referenceNow = DateTime.now();

    ExclusionStore.instance.addListener(_onExclusionsChanged);
    _loadReplayData();
  }

  @override
  void dispose() {
    ExclusionStore.instance.removeListener(_onExclusionsChanged);
    super.dispose();
  }

  void _onExclusionsChanged() {
    if (mounted) {
      _loadReplayData();
    }
  }

  ReplayPeriod _computeCurrentPeriod() {
    if (widget.customPeriod != null) {
      return widget.customPeriod!;
    }

    final now = _referenceNow;
    switch (_selectedKind) {
      case PeriodKind.week:
        // Start on Monday of current week
        final daysFromMonday = now.weekday - 1;
        final monday = DateTime.utc(now.year, now.month, now.day - daysFromMonday);
        final nextMonday = monday.add(const Duration(days: 7));
        return ReplayPeriod(
          kind: PeriodKind.week,
          startWall: monday,
          endWall: nextMonday,
        );

      case PeriodKind.month:
        final startOfMonth = DateTime.utc(now.year, now.month, 1);
        final nextMonth = now.month == 12
            ? DateTime.utc(now.year + 1, 1, 1)
            : DateTime.utc(now.year, now.month + 1, 1);
        return ReplayPeriod(
          kind: PeriodKind.month,
          startWall: startOfMonth,
          endWall: nextMonth,
        );

      case PeriodKind.year:
        final startOfYear = DateTime.utc(now.year, 1, 1);
        final nextYear = DateTime.utc(now.year + 1, 1, 1);
        return ReplayPeriod(
          kind: PeriodKind.year,
          startWall: startOfYear,
          endWall: nextYear,
        );
    }
  }

  ReplayPeriod _computePreviousPeriod(ReplayPeriod current) {
    switch (current.kind) {
      case PeriodKind.week:
        final prevMonday = current.startWall.subtract(const Duration(days: 7));
        return ReplayPeriod(
          kind: PeriodKind.week,
          startWall: prevMonday,
          endWall: current.startWall,
        );

      case PeriodKind.month:
        final y = current.startWall.year;
        final m = current.startWall.month;
        final prevYear = m == 1 ? y - 1 : y;
        final prevMonth = m == 1 ? 12 : m - 1;
        final prevStart = DateTime.utc(prevYear, prevMonth, 1);
        return ReplayPeriod(
          kind: PeriodKind.month,
          startWall: prevStart,
          endWall: current.startWall,
        );

      case PeriodKind.year:
        final prevStart = DateTime.utc(current.startWall.year - 1, 1, 1);
        return ReplayPeriod(
          kind: PeriodKind.year,
          startWall: prevStart,
          endWall: current.startWall,
        );
    }
  }

  Future<void> _loadReplayData() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      if (widget.allTimeIndex != null) {
        _allTimeIndex = widget.allTimeIndex;
      } else {
        await AllTimeIndexStore.instance.init();
        _allTimeIndex = AllTimeIndexStore.instance.index;
      }

      final metaStore = widget.metaStore ?? TrackMetaStore.instance;

      final currentPeriod = _computeCurrentPeriod();
      final prevPeriod = _computePreviousPeriod(currentPeriod);

      File file;
      if (widget.journalFile != null) {
        file = widget.journalFile!;
      } else {
        try {
          final docDir = await getApplicationDocumentsDirectory()
              .timeout(const Duration(milliseconds: 300));
          file = File('${docDir.path}/listen_journal.jsonl');
        } catch (_) {
          file = File('listen_journal.jsonl');
        }
      }

      const reader = ReplayJournalReader();
      final stream = reader.readEvents(file);
      final events = await stream.toList();

      // If journal is empty, synthesize events from legacy listening history
      if (events.isEmpty && widget.journalFile == null) {
        final legacySessions = ListeningHistoryService.instance.getLocalSessions();
        if (legacySessions.isNotEmpty) {
          final now = DateTime.now();
          final linesToWrite = <String>[];
          for (final s in legacySessions) {
            try {
              final started = DateTime.tryParse(s['startedAt']?.toString() ?? '') ?? now;
              final duration = (s['trackDurationMs'] as num? ?? 210000).toInt();
              final listened = (s['listenedMs'] as num? ?? duration).toInt();
              final ev = ListenEvent(
                id: s['eventId']?.toString() ?? 'hist_${s['trackId']}_${started.millisecondsSinceEpoch}',
                trackId: s['trackId']?.toString() ?? '',
                title: s['trackTitle']?.toString() ?? 'Track',
                artistRaw: s['artistName']?.toString() ?? 'Artist',
                albumTitle: s['trackAlbum']?.toString(),
                startedAtUtc: started.toUtc(),
                tzOffsetMin: now.timeZoneOffset.inMinutes,
                endedAtUtc: started.add(Duration(milliseconds: listened)).toUtc(),
                listenedMs: listened,
                durationMs: duration,
                userAdvanced: s['endReason'] == 'skip' || s['endReason'] == 'user_next',
                endedNaturally: s['endReason'] == 'completed',
                loopOne: false,
                source: PlaySource.stream,
                schemaVersion: 1,
              );
              events.add(ev);
              linesToWrite.add('${jsonEncode(ev.toJson())}\n');
            } catch (_) {}
          }
          if (linesToWrite.isNotEmpty) {
            try {
              await file.writeAsString(linesToWrite.join(), mode: FileMode.append, flush: true);
            } catch (_) {}
          }
        }
      }

      final eligibleEvents = events
          .where((e) => !ExclusionStore.instance.isExcluded(e))
          .toList();

      // Compute aggregates
      const engine = ReplayEngine();
      final prevAgg = await engine.compute(
        period: prevPeriod,
        events: Stream.fromIterable(eligibleEvents),
        metaStore: metaStore,
        allTimeIndex: _allTimeIndex,
      );

      final agg = await engine.compute(
        period: currentPeriod,
        events: Stream.fromIterable(eligibleEvents),
        metaStore: metaStore,
        allTimeIndex: _allTimeIndex,
        previousPeriod: prevAgg,
      );

      if (mounted) {
        setState(() {
          _aggregate = agg;
          _previousAggregate = prevAgg;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = 'Could not load your Replay insights: $e';
          _isLoading = false;
        });
      }
    }
  }

  void _onSelectKind(PeriodKind kind) {
    if (_selectedKind != kind) {
      setState(() => _selectedKind = kind);
      _loadReplayData();
    }
  }

  void _playSong(SongStat song) {
    if (widget.onPlaySong != null) {
      widget.onPlaySong!(song);
      return;
    }
    final localTrack = ListeningHistoryService.instance.findTrackById(song.trackId);
    final track = localTrack ??
        Track(
          id: song.trackId,
          title: song.title,
          artist: song.artistRaw,
          album: song.albumTitle ?? '',
          coverUrl: song.coverUrl ?? '',
          durationSeconds: song.listenedMs > 0 ? (song.listenedMs ~/ 1000) : 210,
        );
    try {
      context.read<PlayerState>().setQueue(
        [track],
        startIndex: 0,
        context: PlaybackContext(
          type: PlaybackContextType.library,
          id: 'replay_top_songs',
          tracks: [track],
          startTrack: track,
          title: 'Replay Top Songs',
        ),
      );
    } catch (e) {
      debugPrint('[ReplayScreen] Default play song error: $e');
    }
  }

  void _playMix(List<SongStat> songs) {
    if (widget.onPlayMix != null) {
      widget.onPlayMix!(songs);
      return;
    }
    if (songs.isEmpty) return;
    final tracks = songs.map((s) {
      final localTrack = ListeningHistoryService.instance.findTrackById(s.trackId);
      return localTrack ??
          Track(
            id: s.trackId,
            title: s.title,
            artist: s.artistRaw,
            album: s.albumTitle ?? '',
            coverUrl: s.coverUrl ?? '',
            durationSeconds: s.listenedMs > 0 ? (s.listenedMs ~/ 1000) : 210,
          );
    }).toList();
    try {
      context.read<PlayerState>().setQueue(
        tracks,
        startIndex: 0,
        context: PlaybackContext(
          type: PlaybackContextType.library,
          id: 'replay_mix',
          tracks: tracks,
          startTrack: tracks.first,
          title: 'Replay Mix',
        ),
      );
    } catch (e) {
      debugPrint('[ReplayScreen] Default play mix error: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final period = _computeCurrentPeriod();

    return Scaffold(
      backgroundColor: AppTheme.canvas,
      body: Stack(
        children: [
          // Scrollable Content
          RefreshIndicator(
            onRefresh: _loadReplayData,
            color: AppTheme.brand,
            backgroundColor: AppTheme.surface,
            // Strict top clearance (pt-24+ without negative margins)
            edgeOffset: 96,
            child: SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.only(
                top: 104, // 96px header + 8px breathing space
                left: 16,
                right: 16,
                bottom: 120, // dock space
              ),
              child: _buildBody(context, period),
            ),
          ),

          // Top Sticky Navigation Bar (Apple Music Header)
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: _buildTopBar(context, period),
          ),
        ],
      ),
    );
  }

  Widget _buildTopBar(BuildContext context, ReplayPeriod period) {
    return Container(
      padding: EdgeInsets.only(
        top: MediaQuery.of(context).padding.top + 8,
        left: 16,
        right: 16,
        bottom: 12,
      ),
      decoration: BoxDecoration(
        color: AppTheme.canvas.withValues(alpha: 0.95),
        border: const Border(bottom: BorderSide(color: AppTheme.border)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              // Back Button & Brand Title
              Row(
                children: [
                  if (Navigator.of(context).canPop())
                    InkWell(
                      onTap: () => Navigator.of(context).pop(),
                      borderRadius: BorderRadius.circular(10),
                      child: const Padding(
                        padding: EdgeInsets.only(right: 8),
                        child: Icon(
                          Icons.arrow_back_ios_new_rounded,
                          color: AppTheme.textPrimary,
                          size: 20,
                        ),
                      ),
                    ),
                  const Text(
                    'REPLAY',
                    style: TextStyle(
                      fontFamily: 'SF Pro Display',
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.0,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: AppTheme.brand,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Text(
                      'INSIGHTS',
                      style: TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.5,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ],
              ),

              // Header Action Buttons
              Row(
                children: [
                  // Replay Archive (Time Machine)
                  IconButton(
                    icon: const Icon(Icons.history_rounded, color: AppTheme.textSecondary, size: 22),
                    tooltip: 'Replay Archive',
                    onPressed: () => ReplayArchiveSheet.show(
                      context,
                      archiveService: widget.archiveService ?? const ReplayArchiveService(),
                      currentSnapshot: _aggregate,
                      onSelectSnapshot: (snap) {
                        setState(() => _aggregate = snap);
                      },
                    ),
                  ),

                  // Trophy Room Action
                  IconButton(
                    icon: const Icon(Icons.emoji_events_rounded, color: AppTheme.brand, size: 22),
                    tooltip: 'Trophy Room',
                    onPressed: _aggregate != null
                        ? () => MilestonesTrophyRoom.show(
                              context,
                              aggregate: _aggregate!,
                              allTimeIndex: _allTimeIndex,
                            )
                        : null,
                  ),

                  // Private Listening & Exclusions Action
                  IconButton(
                    icon: const Icon(Icons.visibility_off_rounded, color: AppTheme.textSecondary, size: 22),
                    tooltip: 'Private Listening Exclusions',
                    onPressed: () => PrivateListeningSheet.show(
                      context,
                      exclusionStore: ExclusionStore.instance,
                      onExclusionsChanged: _loadReplayData,
                    ),
                  ),

                  // Listening History Action
                  IconButton(
                    icon: const Icon(Icons.format_list_bulleted_rounded, color: AppTheme.textSecondary, size: 22),
                    tooltip: 'Listening History',
                    onPressed: () {
                      showModalBottomSheet(
                        context: context,
                        isScrollControlled: true,
                        backgroundColor: AppTheme.canvas,
                        shape: const RoundedRectangleBorder(
                          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                        ),
                        builder: (ctx) => SizedBox(
                          height: MediaQuery.of(ctx).size.height * 0.85,
                          child: Scaffold(
                            backgroundColor: Colors.transparent,
                            body: const HistoryView(),
                          ),
                        ),
                      );
                    },
                  ),
                ],
              ),
            ],
          ),

          const SizedBox(height: 10),

          // Period Segmented Controller Bar
          Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.05),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppTheme.border),
            ),
            child: Row(
              children: [
                _buildPeriodTab(PeriodKind.week, 'Week'),
                _buildPeriodTab(PeriodKind.month, 'Month'),
                _buildPeriodTab(PeriodKind.year, 'Year'),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPeriodTab(PeriodKind kind, String label) {
    final isSelected = _selectedKind == kind;

    return Expanded(
      child: InkWell(
        onTap: () => _onSelectKind(kind),
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 6),
          decoration: BoxDecoration(
            color: isSelected ? AppTheme.brand : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: isSelected ? FontWeight.w800 : FontWeight.w500,
              color: isSelected ? Colors.white : AppTheme.textSecondary,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildBody(BuildContext context, ReplayPeriod period) {
    if (_isLoading) {
      return _buildLoadingShimmer();
    }

    if (_errorMessage != null) {
      return _buildErrorState(_errorMessage!);
    }

    final agg = _aggregate;
    if (agg == null || agg.totalQualifiedPlays == 0) {
      return _buildEmptyState();
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 1. Period Delta Pill & Summary Callout (F4)
        if (_previousAggregate != null) ...[
          PeriodDeltaPill(aggregate: agg),
          const SizedBox(height: 16),
        ],

        // 2. Play Replay Mix Floating Action Pill (F22)
        if (agg.topSongs.isNotEmpty) ...[
          _buildPlayMixPill(agg.topSongs),
          const SizedBox(height: 16),
        ],

        // 3. Top Artists Section (F5: splitting + expand)
        TopArtistsSection(
          artists: agg.topArtists,
          onPlaySong: _playSong,
        ),
        const SizedBox(height: 16),

        // 4. Top Songs Section (F7: minimal, simple, exact seconds)
        TopSongsSection(
          songs: agg.topSongs,
          onPlaySong: _playSong,
        ),
        const SizedBox(height: 16),

        // 5. Most Listened Album (F8: >= 2 distinct tracks)
        if (agg.topAlbums.isNotEmpty) ...[
          TopAlbumCard(
            album: agg.topAlbums.first,
            onPlaySong: _playSong,
          ),
          const SizedBox(height: 16),
        ],

        // 6. Top Composers, Singers & Film Soundtrack (F6)
        if (agg.topComposers.isNotEmpty || agg.topSingers.isNotEmpty || agg.topMovie != null) ...[
          ComposersSingersSection(
            topComposers: agg.topComposers,
            topSingers: agg.topSingers,
            topMovie: agg.topMovie,
            onPlaySong: _playSong,
          ),
          const SizedBox(height: 16),
        ],

        // 7. On Repeat & Loop Obsession (F9)
        if (agg.loops.isNotEmpty || agg.heavyRotation.isNotEmpty) ...[
          OnRepeatSection(
            loops: agg.loops,
            heavyRotation: agg.heavyRotation,
            onPlaySong: (trackId) {
              final song = agg.topSongs.firstWhere(
                (s) => s.trackId == trackId,
                orElse: () => SongStat(
                  trackId: trackId,
                  title: trackId,
                  artistRaw: '',
                  listenedMs: 0,
                  qualifiedPlays: 0,
                ),
              );
              _playSong(song);
            },
          ),
          const SizedBox(height: 16),
        ],

        // 8. Daypart & Peak Hour (F1)
        DaypartCard(daypart: agg.daypart),
        const SizedBox(height: 16),

        // 9. Heatmap Calendar (F2: GitHub-style 5-level quartiles)
        HeatmapCalendar(
          period: period,
          heatmapDays: agg.heatmapDays,
          dayTopSongs: agg.dayTopSongs,
          onPlaySong: _playSong,
        ),
        const SizedBox(height: 16),

        // 10. Day of Week Personality (F3)
        DayOfWeekCard(dayOfWeekMinutes: agg.dayOfWeekMinutes),
        const SizedBox(height: 16),

        // 11. Discovery Score & Single-Play Gems (F11)
        DiscoverySection(
          discovery: agg.discovery,
          onPlaySong: _playSong,
        ),
        const SizedBox(height: 16),

        // 12. Music Geography Podium (F12)
        if (agg.geography.isNotEmpty) ...[
          MusicGeographySection(countries: agg.geography),
          const SizedBox(height: 16),
        ],

        // 13. Era & Decades Breakdown (F13)
        if (agg.decades.totalMs > 0) ...[
          DecadesBreakdownSection(decades: agg.decades),
          const SizedBox(height: 16),
        ],

        // 14. Artist Loyalty Timeline (F14)
        if (agg.loyalty != null) ...[
          LoyaltyTimelineCard(loyalty: agg.loyalty),
          const SizedBox(height: 16),
        ],

        // 15. Skip Hall of Fame (F10)
        if (agg.skips.isNotEmpty) ...[
          SkipHallOfFameCard(skips: agg.skips),
          const SizedBox(height: 16),
        ],

        // 16. Milestones & Trophy Room Preview (F15)
        MilestonesTrophyRoom(
          aggregate: agg,
          allTimeIndex: _allTimeIndex,
        ),
        const SizedBox(height: 16),

        // 17. Milestone Moments 2-Tab Card (F16)
        if (_allTimeIndex != null) ...[
          MilestoneMomentsCard(
            allTimeIndex: _allTimeIndex!,
          ),
          const SizedBox(height: 16),
        ],

        // 18. Offline Data Saved (F25: 160 kbps)
        OfflineDataSavedCard(bytesSaved: agg.offlineDataSavedBytes),
        const SizedBox(height: 16),

        // 19. Created Playlists Live Section (F23)
        CreatedPlaylistsSection(
          playlists: LibraryStore.instance.playlists,
        ),
        const SizedBox(height: 16),

        // 20. Liked Songs Spotlight (F24)
        LikedSongsSpotlight(
          likedPlayedSongs: agg.topSongs
              .where((s) => LibraryStore.instance.isLikedId(s.trackId))
              .toList(),
          totalLikedInLibrary: LibraryStore.instance.likedCount,
          onPlaySong: _playSong,
        ),
        const SizedBox(height: 16),

        // Phase 11 Add-Ons: First Song, Marathon, Languages, Focus, Personality
        if (agg.firstSongOfPeriod != null) ...[
          FirstSongCard(
            firstSong: agg.firstSongOfPeriod,
            onPlaySong: _playSong,
          ),
          const SizedBox(height: 16),
        ],

        if (agg.marathon != null) ...[
          MarathonSessionCard(marathon: agg.marathon),
          const SizedBox(height: 16),
        ],

        if (agg.languages.isNotEmpty) ...[
          LanguagesBarCard(languages: agg.languages),
          const SizedBox(height: 16),
        ],

        CompletionFocusCard(aggregate: agg),
        const SizedBox(height: 16),

        ListenerPersonalityCard(aggregate: agg),
        const SizedBox(height: 24),

        // 21. Interactive Feature Buttons (Story F19, Quiz F20, Match F17)
        _buildDelightButtonsRow(),
      ],
    );
  }

  Widget _buildPlayMixPill(List<SongStat> songs) {
    final count = songs.take(50).length;

    return InkWell(
      onTap: () {
        if (widget.onPlayMix != null) {
          widget.onPlayMix!(songs.take(50).toList());
        } else if (songs.isNotEmpty) {
          _playMix(songs.take(50).toList());
        }
      },
      borderRadius: BorderRadius.circular(16),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 20),
        decoration: BoxDecoration(
          color: AppTheme.brand,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: AppTheme.brand.withValues(alpha: 0.3),
              blurRadius: 16,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.play_circle_fill_rounded, color: Colors.white, size: 24),
            const SizedBox(width: 10),
            Text(
              'PLAY YOUR REPLAY MIX ($count SONGS)',
              style: const TextStyle(
                fontFamily: 'SF Pro Display',
                fontSize: 14,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.5,
                color: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDelightButtonsRow() {
    return Column(
      children: [
        _buildActionButton(
          label: 'VIEW REPLAY STORY',
          icon: Icons.movie_filter_rounded,
          onTap: () {
            if (widget.onOpenStory != null) {
              widget.onOpenStory!();
            } else if (_aggregate != null) {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => StoryWalkthroughScreen(
                    snapshot: _aggregate!,
                    onPlayMix: _aggregate!.topSongs.isNotEmpty
                        ? () => _playMix(_aggregate!.topSongs.take(50).toList())
                        : null,
                  ),
                ),
              );
            }
          },
        ),
        const SizedBox(height: 10),
        _buildActionButton(
          label: 'PLAY REPLAY QUIZ',
          icon: Icons.psychology_rounded,
          onTap: () {
            if (widget.onOpenQuiz != null) {
              widget.onOpenQuiz!();
            } else if (_aggregate != null) {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => ReplayQuizScreen(
                    snapshot: _aggregate!,
                    allTimeIndex: _allTimeIndex,
                  ),
                ),
              );
            }
          },
        ),
        const SizedBox(height: 10),
        _buildActionButton(
          label: 'COMPARE REPLAY WITH FRIENDS',
          icon: Icons.people_alt_rounded,
          onTap: () {
            if (widget.onOpenMatch != null) {
              widget.onOpenMatch!();
            } else if (_aggregate != null) {
              final mySnap = ReplayMatchService.buildSnapshot(_aggregate!, displayName: 'You');
              final friendSnap = ReplayMatchService.buildSnapshot(
                _previousAggregate ?? _aggregate!,
                userId: 'zen_community',
                displayName: 'Zen Community',
              );
              final result = ReplayMatchService.match(mySnap, friendSnap);
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => ReplayMatchScreen(
                    mySnapshot: mySnap,
                    friendSnapshot: friendSnap,
                    matchResult: result,
                  ),
                ),
              );
            }
          },
        ),
        if (_aggregate != null && _aggregate!.topSongs.isNotEmpty) ...[
          const SizedBox(height: 10),
          _buildActionButton(
            label: 'DEDICATE A SONG TO A FRIEND',
            icon: Icons.card_giftcard_rounded,
            onTap: () {
              DedicateSongSheet.show(
                context,
                song: _aggregate!.topSongs.first,
              );
            },
          ),
        ],
        const SizedBox(height: 10),
        _buildActionButton(
          label: 'TIME MACHINE ARCHIVE',
          icon: Icons.history_rounded,
          onTap: () {
            ReplayArchiveSheet.show(
              context,
              archiveService: widget.archiveService ?? const ReplayArchiveService(),
              currentSnapshot: _aggregate,
              onSelectSnapshot: (snap) {
                setState(() => _aggregate = snap);
              },
            );
          },
        ),
      ],
    );
  }

  Widget _buildActionButton({
    required String label,
    required IconData icon,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppTheme.border),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: AppTheme.brand, size: 18),
            const SizedBox(width: 8),
            Text(
              label,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.5,
                color: AppTheme.textPrimary,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLoadingShimmer() {
    return Column(
      children: List.generate(
        4,
        (index) => Container(
          width: double.infinity,
          height: 140,
          margin: const EdgeInsets.only(bottom: 16),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.03),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppTheme.border),
          ),
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 60, horizontal: 24),
      alignment: Alignment.center,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: AppTheme.brand.withValues(alpha: 0.15),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.headphones_rounded,
              size: 48,
              color: AppTheme.brand,
            ),
          ),
          const SizedBox(height: 20),
          const Text(
            'Your Replay is Warming Up',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: AppTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Listen to more music on Zenify to unlock your personalized listening insights, top artists, and replay milestones.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 14,
              color: AppTheme.textSecondary,
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorState(String error) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      alignment: Alignment.center,
      child: Column(
        children: [
          const Icon(Icons.error_outline_rounded, color: AppTheme.brand, size: 40),
          const SizedBox(height: 12),
          Text(
            error,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 14, color: AppTheme.textSecondary),
          ),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: _loadReplayData,
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.brand,
              foregroundColor: Colors.white,
            ),
            child: const Text('Try Again'),
          ),
        ],
      ),
    );
  }
}
