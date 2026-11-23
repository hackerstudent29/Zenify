# ZENIFY REPLAY & INSIGHTS: STATUS LEDGER

> **Master Tracking Ledger** per `ZENIFY_REPLAY_AGENT_GUIDE.md` §14.1.  
> **Rule:** Status changes only with test and artifact evidence. No premature `DONE`.

---

## 1. Feature Status Table

| ID | Feature | Phase | Status | Evidence (Links / Paths) | Tests | Notes |
|---|---|:---:|:---:|---|---|---|
| **F1** | Daypart & Peak Hour | 4 | `DONE` | `presentation/widgets/daypart_card.dart` | `phase4_time_widgets_test.dart` | Local wall clock bucketing; 24-hr histogram; personality title |
| **F2** | Heatmap Calendar | 4 | `DONE` | `presentation/widgets/heatmap_calendar.dart`, `day_detail_sheet.dart` | `phase4_time_widgets_test.dart` | GitHub-style 5-level quartiles; tap day modal sheet |
| **F3** | Day-of-Week Personality | 4 | `DONE` | `presentation/widgets/day_of_week_card.dart` | `phase4_time_widgets_test.dart` | Mon–Sun distribution; ≥18% personality trigger |
| **F4** | Period-over-Period Delta | 4 | `DONE` | `presentation/widgets/period_delta_pill.dart` | `phase4_time_widgets_test.dart` | ▲/▼/• with null prev handling & top artist shift |
| **F5** | Top Artists (Splitting + Expand) | 5 | `DONE` | `presentation/widgets/top_artists_section.dart` | `phase5_music_intelligence_widgets_test.dart` | Individual split; tap-to-expand played tracks |
| **F6** | Composers, Singers & Movie | 5 | `DONE` | `presentation/widgets/composers_singers_section.dart` | `phase5_music_intelligence_widgets_test.dart` | Roles split; movie soundtrack card; ≥60% coverage |
| **F7** | Top Songs (Exact Seconds) | 5 | `DONE` | `presentation/widgets/top_songs_section.dart` | `phase5_music_intelligence_widgets_test.dart` | Clean artist; exact seconds (fmtHms); rank # |
| **F8** | Most Listened Album | 5 | `DONE` | `presentation/widgets/top_album_card.dart` | `phase5_music_intelligence_widgets_test.dart` | ≥2 distinct tracks rule; expandable tracklist |
| **F9** | "On Repeat" & Loop Obsession | 5 | `DONE` | `presentation/widgets/on_repeat_section.dart` | `phase5_music_intelligence_widgets_test.dart` | Consecutive loop runs ≥3; Heavy Rotation ≥5 |
| **F10**| Skip Hall of Fame | 5 | `DONE` | `presentation/widgets/skip_hall_of_fame_card.dart` | `phase5_music_intelligence_widgets_test.dart` | Light-hearted tone; ≥3 skips & ≥50% skip rate |
| **F11**| Discovery & New Found Artists | 6 | `DONE` | `presentation/widgets/discovery_section.dart` | `phase6_discovery_widgets_test.dart` | First-play index; single-play gems carousel |
| **F12**| Music Geography | 6 | `DONE` | `presentation/widgets/music_geography_section.dart` | `phase6_discovery_widgets_test.dart` | Strict unique track count; top 3 podium + flags |
| **F13**| Era & Decades Breakdown | 6 | `DONE` | `presentation/widgets/decades_breakdown_section.dart` | `phase6_discovery_widgets_test.dart` | 2020s, 2010s, 2000s, Classics (<2000) bar |
| **F14**| Artist Loyalty Timeline | 6 | `DONE` | `presentation/widgets/loyalty_timeline_card.dart` | `phase6_discovery_widgets_test.dart` | ≥30 days loyalty in top 3; render only if data |
| **F15**| Milestones & Trophy Room | 7 | `DONE` | `presentation/widgets/milestones_trophy_room.dart` | `phase7_milestones_and_exclusions_test.dart` | Replay evaluation; streak math; progress rings |
| **F16**| Milestone Moments (2 Tabs) | 7 | `DONE` | `presentation/widgets/milestone_moments_card.dart` | `phase7_milestones_and_exclusions_test.dart` | Tab A (unique songs) vs Tab B (total plays) |
| **F17**| Replay Match & Musical Battle | 10| `DONE` | `domain/models/match_models.dart`, `domain/services/replay_match_service.dart`, `presentation/social/replay_match_screen.dart` | `phase10_social_viral_test.dart` | Compatibility % + side-by-side battle + crown |
| **F18**| Dedicate / Gift a Song | 10| `DONE` | `domain/models/gift_models.dart`, `domain/services/gift_service.dart`, `presentation/social/dedicate_song_sheet.dart` | `phase10_social_viral_test.dart` | 140-char glass note; token link + app_links |
| **F19**| Story Walkthrough | 9 | `DONE` | `presentation/story/story_walkthrough_screen.dart` | `phase9_delight_features_test.dart` | Full-screen animated slides; segmented bars; 5 personality rules |
| **F20**| Replay Quiz | 9 | `DONE` | `presentation/quiz/replay_quiz_screen.dart` | `phase9_delight_features_test.dart` | Pre-reveal 3-clue guess game; 4 choices; scoring 3/2/1 pts |
| **F21**| Replay Archive ("Time Machine")| 9 | `DONE` | `domain/services/replay_archive_service.dart`, `presentation/archive/replay_archive_sheet.dart` | `phase9_delight_features_test.dart` | Immutable closed period snapshots; time travel; auto backfill |
| **F22**| Play Your Replay Mix | 9 | `DONE` | `domain/services/replay_mix_service.dart`, `presentation/replay_screen.dart` | `phase9_delight_features_test.dart` | One-tap floating pill; queue top 25/50 songs |
| **F23**| Created Playlists (Live Only) | 5 | `DONE` | `presentation/widgets/created_playlists_section.dart` | `phase5_music_intelligence_widgets_test.dart` | Live list; creation timestamps; deleted excluded |
| **F24**| Liked Songs Spotlight | 5 | `DONE` | `presentation/widgets/liked_songs_spotlight.dart` | `phase5_music_intelligence_widgets_test.dart` | Liked songs played in period; total liked count |
| **F25**| Data Saved by Offline Mode | 7 | `DONE` | `presentation/widgets/offline_data_saved_card.dart` | `phase7_milestones_and_exclusions_test.dart` | Bytes saved at 160 kbps; hide if <10 MB |
| **F26**| Private Listening & Exclusions | 7 | `DONE` | `presentation/widgets/private_listening_sheet.dart` | `phase7_milestones_and_exclusions_test.dart` | Read-time exclusion of songs/playlists/sessions |
| **F27**| Weekly Replay Digest | 11| `DONE` | `domain/services/weekly_digest_service.dart` | `phase11_addons_test.dart` | Local Sunday notification; personalized stats |

---

## 2. Add-Ons Status

| Add-On | Target Phase | Status | Notes |
|---|:---:|:---:|---|
| **Longest Listening Marathon** | 11 | `DONE` | `presentation/widgets/marathon_session_card.dart` (min 30 min duration; 5-min gap; formatted times) |
| **Languages Bar** | 11 | `DONE` | `presentation/widgets/languages_bar_card.dart` (segmented bar top 4 + Other; min 60% coverage) |
| **Completion Rate & Focus** | 11 | `DONE` | `presentation/widgets/completion_focus_card.dart` (natural ends / starts; focus level badge) |
| **First Song of Period** | 11 | `DONE` | `presentation/widgets/first_song_card.dart` (earliest eligible event in period; artwork + play action) |
| **Listener Personality Card** | 11 | `DONE` | `presentation/widgets/listener_personality_card.dart` (shareable card with deterministic reason) |

---

## 3. Phase Progress & Gates

| Phase | Description | Status | Evidence / Verification |
|:---:|---|:---:|---|
| **Phase 0** | Codebase Reconnaissance & Ground-Truth Verification | `DONE` | `REPLAY_RECON.md` verified across 16 questions; user approved. |
| **Phase 1** | Data Foundation (Events, Time, Exclusions, All-Time Index) | `DONE` | `mobile/test/replay/phase1_data_foundation_test.dart` (14/14 tests pass; 0 analyzer warnings). |
| **Phase 2** | Metadata Enrichment (TrackMeta, Seed Asset, Backend Endpoint) | `DONE` | `mobile/test/replay/phase2_metadata_enrichment_test.dart` (6/6 tests pass); `backend/src/routes/replay.routes.ts` compiled clean (0 tsc errors); 200 seed tracks bundled. |
| **Phase 3** | Aggregation Pipeline (Engine, Caching, Session Splitter) | `DONE` | `mobile/test/replay/phase3_aggregation_engine_test.dart` (5/5 tests pass; 10,000 events benchmark ~420ms in debug VM; disk + memory cache validated; 0 analyzer warnings). |
| **Phase 4** | Time Intelligence Widgets (F1, F2, F3, F4) | `DONE` | `mobile/test/replay/phase4_time_widgets_test.dart` (8/8 tests pass; 0 analyzer warnings). DaypartCard, HeatmapCalendar, DayDetailSheet, DayOfWeekCard, PeriodDeltaPill. |
| **Phase 5** | Artist, Song, Album, Loop, Skip & Library Widgets (F5-F10, F23, F24) | `DONE` | `mobile/test/replay/phase5_music_intelligence_widgets_test.dart` (8/8 tests pass; 0 analyzer issues). TopArtistsSection, ComposersSingersSection, TopSongsSection, TopAlbumCard, OnRepeatSection, SkipHallOfFameCard, CreatedPlaylistsSection, LikedSongsSpotlight. |
| **Phase 6** | Discovery, Decades, Geography & Loyalty (F11-F14) | `DONE` | `mobile/test/replay/phase6_discovery_widgets_test.dart` (8/8 tests pass; 0 analyzer issues). DiscoverySection, MusicGeographySection, DecadesBreakdownSection, LoyaltyTimelineCard. |
| **Phase 7** | Milestones, Moments, Offline Data & Exclusions (F15, F16, F25, F26) | `DONE` | `mobile/test/replay/phase7_milestones_and_exclusions_test.dart` (5/5 tests pass; 0 analyzer issues). MilestonesTrophyRoom, MilestoneMomentsCard, OfflineDataSavedCard, PrivateListeningSheet. |
| **Phase 8** | Replay Screen Architecture & Navigation | `DONE` | `mobile/test/replay/phase8_replay_screen_test.dart` (2/2 tests pass; 0 analyzer issues). `ReplayScreen` with fixed header clearance (96px+), sticky period selector, pull-to-refresh, modal sheets (Trophy Room, Private Listening), and F22 play mix button. |
| **Phase 9** | Delight Features (Story, Quiz, Mix, Time Machine) (F19-F22) | `DONE` | `mobile/test/replay/phase9_delight_features_test.dart` (6/6 tests pass; 0 analyzer issues). `StoryWalkthroughScreen` with full-screen slides & 5 personality rules; `ReplayQuizScreen` with 3-clue guessing game & scoring; `ReplayArchiveService` & `ReplayArchiveSheet` time machine; `ReplayMixService` playback queuing. |
| **Phase 10**| Social & Viral Features (Replay Match, Dedicate Song) (F17, F18) | `DONE` | `mobile/test/replay/phase10_social_viral_test.dart` (5/5 tests pass; 0 analyzer issues). `ReplayMatchScreen` with 👑 Music Titan battle & weighted Jaccard; `DedicateSongSheet` with 140-char counter & frosted glass card; backend routes compiled cleanly. |
| **Phase 11**| Add-Ons & Notifications (Marathon, Languages, Personality, Digest) (F27) | `DONE` | `mobile/test/replay/phase11_addons_test.dart` (6/6 tests pass; 0 analyzer issues). MarathonSessionCard, LanguagesBarCard, CompletionFocusCard, FirstSongCard, ListenerPersonalityCard, WeeklyDigestService. |
| **Phase 12**| Hardening, Benchmarking, Zero-Data States & Polish | `DONE` | `mobile/test/replay/phase12_hardening_test.dart` (4/4 tests pass); full Replay test suite 77/77 tests pass cleanly; backend compiled 0 tsc errors; 0 analyzer issues; 0 forbidden patterns. |

---

## 4. Deviations From Guide
*(None. All assumptions reconciled against live code during Phase 0).*

---

## 5. Open Risks
1. ~~**Journal Rotation:** `ListeningTrackerService.drainJournal()` currently deletes lines from `listen_journal.jsonl` upon server sync.~~ **RESOLVED in Phase 1:** Decoupled server sync queue using `_journalSyncOffsetKey` in SharedPreferences. `listen_journal.jsonl` is strictly append-only and preserved permanently on device for local Replay.
2. **Metadata Enrichment Rates:** Upstream music databases (MusicBrainz) require rate-limiting (~1 req/sec). Seed dataset (`assets/meta/artist_seed.json`) is essential for immediate offline fidelity.
3. **Notification Dependency:** Android 13+ local notifications requires `flutter_local_notifications` + desugaring in `build.gradle.kts` (to be approved in Phase 11).

---

## 5. Dependency Requests
*No dependencies requested yet. Phase 0 requires 0 dependencies.*
