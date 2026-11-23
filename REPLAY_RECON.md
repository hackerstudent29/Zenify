# ZENIFY REPLAY & INSIGHTS: PHASE 0 RECONNAISSANCE REPORT

> **Generated:** 2026-11-22  
> **Status:** Phase 0 Complete — All 16 Contract Questions Verified Against Live Code  
> **Rule:** Every assertion below includes verified file paths, line ranges, and actual code signatures.

---

## 1. THE 16 RECONNAISSANCE CONTRACT QUESTIONS

### Q1: Exact On-Disk Format of the Listening Journal (`ListeningTrackerService`)
* **File:** `mobile/lib/services/listening_tracker_service.dart` (lines 73–94, 108–112, 199–214)
* **Location:** `<getApplicationDocumentsDirectory()>/listen_journal.jsonl`
* **Format:** Line-delimited JSON (`JSONL`), UTF-8 encoded with trailing newline `\n`.
* **Fields per record (`Map<String, dynamic> finalize(...)`):**
  * `eventId`: String (`'ev_${msSinceEpoch}_${trackId.hashCode.abs()}'`)
  * `startedAt`: String (ISO 8601 UTC)
  * `endedAt`: String (ISO 8601 UTC)
  * `tzOffsetMin`: int (`endedAt.timeZoneOffset.inMinutes`)
  * `listenedMs`: int (active playback ms, pauses excluded)
  * `trackDurationMs`: int
  * `endReason`: String (`'completed'`, `'skipped'`, `'queue_replaced'`, `'app_killed'`)
  * `trackSource`: String (`'youtube'`)
  * `trackId`: String
  * `trackTitle`: String
  * `trackAlbum`: String? (optional)
  * `language`: String? (optional)
  * `genre`: String? (optional)
  * `contextType`: String? (optional)
  * `contextId`: String? (optional)
  * `offline`: bool (default false)
  * `quality`: int (default 256)
  * `artists`: `List<Map<String, dynamic>>` (`[{'artistName': ..., 'artistKey': ..., 'isPrimary': ...}]`)
* **Rotation & Retention Current Behavior:**
  * In lines 220–274 (`drainJournal()`), batches of 50 lines are synced to backend `POST /api/me/listening/batch`.
  * **CRITICAL FINDING:** Lines uploaded successfully to the backend are deleted from `listen_journal.jsonl`!
  * **Phase 1 Contract Resolution:** `listen_journal.jsonl` must NOT be drained/wiped for Replay. The local journal must be retained on device as the persistent append-only event source. An upload cursor or separate outbox file (e.g. `sync_queue.jsonl`) will be used for server sync so local Replay history is never deleted upon sync.

---

### Q2: What `ListeningHistoryService` Already Computes & What Can Be Reused
* **File:** `mobile/lib/services/listening_history_service.dart` (lines 11–155, 284–545)
* **Storage Keys in SharedPreferences:**
  * `zenify_listening_history_v1` (recent 60 `Track` objects)
  * `zenify_artist_play_counts_v1` (`Map<String, int>`)
  * `zenify_track_play_counts_v1` (`Map<String, int>`)
  * `zenify_track_listened_ms_v1` (`Map<String, int>`)
  * `zenify_total_listening_ms_v1` (`int`)
  * `zenify_listening_sessions_v1` (recent 300 session events)
* **What is Computed Today (`getLocalInsights({String range = 'all'})`):**
  * `totalListeningMs`, `totalListeningMinutes`, `totalPlays`
  * `uniqueTracks`, `uniqueArtists`
  * `rankedTracks` (top 10 by plays desc, listenedMs desc)
  * `rankedArtists` (top 10 by plays desc, listenedMs desc)
  * `streakDays` (computed by looking back up to 365 days)
  * `heatmapNormalized` (7x24 matrix, normalized 0..4 against max cell)
  * `peakDay`, `peakHour`, `peakTime`
  * `rankedGenres`, `rankedLanguages`
  * `personality` archetype (`Night Explorer` vs `Acoustic Traveler`)
* **What Needs Pure Rewriting for Replay Specs:**
  * `_sessions` is currently capped at 300 events in memory/prefs (not full history).
  * Artist aggregation in `ListeningHistoryService:169` and `345` was taking only `track.artist.split(',').first.trim()` (glitching composite artists).
  * Replay will read directly from the persistent `ListenEvent` stream through `ReplayEventSource.eligible(period)` via pure domain calculators off the UI thread (`Isolate.run`).

---

### Q3: Play Event Recording Capabilities
* **File:** `mobile/lib/services/listening_tracker_service.dart` (lines 13–94)
* **Start time:** Yes (`startedAt.toUtc().toIso8601String()`).
* **Listened ms:** Yes (`listenedMs`, pauses subtracted via `onPlay()` / `onPause()`).
* **Track duration:** Yes (`trackDurationMs`).
* **Skipped/Completed flag:** Yes (`endReason`: `'completed'`, `'skipped'`, `'queue_replaced'`).
* **Source (stream/offline/cache):** Currently has `offline` boolean and `trackSource: 'youtube'`. Does not currently distinguish `cache` vs `stream`.
* **Playlist/Album context:** Parameters `contextType` and `contextId` exist in `ActiveListenSession` and `startTrack(...)`.
* **Loop mode:** Currently NOT logged in `startTrack`. `loopOne` boolean must be passed from `PlayerState.repeatMode == RepeatMode.one` into `startTrack`.

---

### Q4: Track Metadata Model Fields
* **File:** `mobile/lib/models/track.dart` (lines 6–40)
* **Existing Fields:**
  * `id`: String
  * `title`: String
  * `artist`: String
  * `album`: String
  * `coverUrl`: String
  * `streamUrl`: String?
  * `durationSeconds`: int
  * `language`: String
  * `hasLyrics`: bool
  * `source`: String (`'youtube'`, `'local'`)
  * `artists`: `List<ArtistRef>`
  * `isVideo`: bool
  * `albumBrowseId`: String?
* **Missing Fields:**
  * `releaseYear`: int? (absent)
  * `composers`: `List<String>` (absent)
  * `singers`: `List<String>` (absent)
  * `movieTitle`: String? (absent)
  * `primaryCountryIso`: String? (absent)
  * `genres`: `List<String>` (absent)
* **Resolution:** Will be provided via `TrackMeta` store layered resolver (Phase 2).

---

### Q5: Exact Signature of `MediaNormalizer.splitArtistNames()` & Behavior
* **File:** `mobile/lib/utils/media_normalizer.dart` (lines 466–555)
* **Signature:**
  ```dart
  static List<String> splitArtistNames(dynamic rawArtists)
  ```
* **Behavior Analysis:**
  * `"A, B"` → `['A', 'B']` (splits on `,`)
  * `"A & B"` → `['A', 'B']` (splits on ` & `)
  * `"A feat. B"` → `['A', 'B']` (splits on `feat.`)
  * `"A (feat. B)"` → `['A', 'B']` (pre-processed line 489)
  * `"AC/DC"` → ⚠️ **Currently splits into `['AC', 'DC']`** because of `/` in regex line 499.
  * `"Tyler, The Creator"` → ⚠️ **Currently splits into `['Tyler', 'The Creator']`** because of `,` in regex line 499.
  * `"Simon & Garfunkel"` → ⚠️ **Currently splits into `['Simon', 'Garfunkel']`** because of ` & ` in regex line 500.
* **Resolution:** We will add an allowlist in `MediaNormalizer` (or check against the seed allowlist) so indivisible artist names (`Tyler, The Creator`, `AC/DC`, `Simon & Garfunkel`, `Earth, Wind & Fire`, `Crosby, Stills, Nash & Young`) are preserved intact.

---

### Q6: `LibraryStore.instance.playlists` Model & Deletions
* **File:** `mobile/lib/services/library_store.dart` (lines 95–101, 718–734)
* **Model:**
  ```dart
  class UserPlaylist {
    UserPlaylist({required this.id, required this.name, List<String>? trackIds})
        : trackIds = trackIds ?? [];
    final String id;
    String name;
    final List<String> trackIds;
  }
  ```
* **Does it have `createdAt`?**
  * **NO.** `createdAt` is currently missing from `UserPlaylist`.
* **Resolution:**
  * Add nullable `DateTime? createdAt` to `UserPlaylist` (`this.createdAt`).
  * On creation (`createPlaylist`), assign `createdAt: DateTime.now()`.
  * In `toJson()` / `fromJson()`, serialize `createdAt` (ISO 8601). Old saved playlists with `null` will render as `null` (name + track count only; never fabricate fake dates).
* **How are deletions represented?**
  * Lines 721: `_playlists.removeWhere((p) => p.id == id); _save();`
  * Deleted playlists are immediately purged from `_playlists`. Reading live `LibraryStore.instance.playlists` guarantees deleted playlists are never returned.

---

### Q7: `LibraryStore` Liked Tracks API
* **File:** `mobile/lib/services/library_store.dart` (lines 508–545)
* **Signatures:**
  * `List<Track> get likedTracks => _resolve(_liked);`
  * `int get likedCount => _liked.length;`
  * `bool isLiked(Track t) => _liked.contains(_key(t));`
  * `bool isLikedId(String? id) => id != null && id.isNotEmpty && _liked.contains(id);`
  * `void toggleLike(Track t)`
* **Internal state:** `final List<String> _liked = [];` storing track ID strings.

---

### Q8: `PlayerState`: Queue Management & Audio Preview API
* **File:** `mobile/lib/services/player_state.dart` (lines 465–516, 520–542)
* **Queue API:**
  ```dart
  Future<void> setQueue(
    List<Track> tracks, {
    int startIndex = 0,
    bool? shuffle,
    bool collectionLocked = false,
    PlaybackContext? context,
  })
  ```
  * Replaces the entire queue and begins playback at `startIndex` (0).
* **Audio Preview API:**
  * `PlayerState` manages the active user queue via Android Media3 / native DSP engine.
  * For isolated short previews (Story Walkthrough, Top Songs preview) without disturbing active user playback:
    * `audioplayers: ^6.8.1` is already installed in `pubspec.yaml` (line 46).
    * We can instantiate an independent `AudioPlayer()` dedicated to previews, which checks `if (playerState.isPlaying) return;` to avoid hijacking active listening.

---

### Q9: Story & Share Engine
* **File:** `mobile/lib/features/story_sharing/story_service.dart` (lines 245–460)
* **Capture:** `StoryImageRenderer.captureToPng(boundaryKey, pixelRatio: 3.0, targetWidth: 1080)` converts any `RepaintBoundary` into a PNG file.
* **Gallery Save:** `GallerySaveService.saveImageToGallery(imageFile, title: 'Zenify_Story')` uses `Gal.putImage(imageFile.path, album: 'Zenify')` with fallback to Android MediaStore MethodChannel (`'com.zenify.mobile/story_share'`).
* **Native Instagram Story:** `StorySharingService.shareImage(StoryShareTarget.instagram, file, ...)` sends `com.instagram.share.ADD_TO_STORY` intent with interactive background gradient colors.
* **System Sheet:** `StorySharingService.shareImage(StoryShareTarget.system, file, text: text)` calls `SharePlus.instance.share(ShareParams(files: [XFile(path)]))`.

---

### Q10: `app_links` Deep Link Route Table
* **File:** `mobile/lib/services/room_deep_links.dart` (lines 17–33, 43–58)
* **Current Handler:** `AppLinks().uriLinkStream` listens for URIs.
* **Current Routes:**
  * `zenify://room/:code`
  * `https://zenify.app/room/:code`
  * `https://listenzenify.com/room/:code`
* **Adding New Routes (`/match/:token`, `/gift/:token`, `/replay/:id`):**
  * In `AndroidManifest.xml` (line 75), add `<data android:pathPrefix="/match"/>`, `<data android:pathPrefix="/gift"/>`, and `<data android:pathPrefix="/replay"/>`.
  * Extend `parseDeepLink(Uri)` in a centralized router to extract `MatchLink`, `GiftLink`, `ReplayLink`, and `RoomLink`.

---

### Q11: Friend Graph on Backend
* **File:** `backend/prisma/schema.prisma` (lines 664–675, 967–1035, 735–770)
* **Result:**
  * There is **NO direct user-to-user friend graph** in the database (no `Friend` or `UserFollow` table).
  * `model ArtistFollow` exists only for users following musical artists.
  * User-to-user interaction exists via:
    * `TogetherRoom` / `TogetherRoomMember` / `TogetherInvite` (Room Together live sync)
    * `BlendSession` / `BlendSnapshot` (Blend invite tokens)
* **Phase 10 Social Architecture:**
  * Replay Match and Gift a Song will follow the exact same proven token-invite model: `MatchInvite` and `SongGift` with cryptographic tokens and shareable URLs (`https://zenify.app/match/:token` and `https://zenify.app/gift/:token`) + QR codes (`qr_flutter`).

---

### Q12: Backend Architecture & Specifications
* **File:** `backend/src/index.ts`, `backend/src/controllers/me.controller.ts`, `backend/src/routes/me.routes.ts`
* **Framework:** Fastify 5 (`fastify: ^5.0.0`)
* **Validation:** `fastify-type-provider-zod` with Zod schemas (`validatorCompiler`, `serializerCompiler`).
* **Auth:** `@fastify/jwt` + `@fastify/cookie` with `preHandler: [server.authenticate]`.
* **Rate Limiting:** `@fastify/rate-limit` configured globally (300 req/min) and per route (e.g. 60 req/min on `/listening/batch`).
* **Error Format:** `@fastify/sensible` generating `{ statusCode, error, message }`.
* **ORM:** Prisma 5 (`@prisma/client`) with PostgreSQL.

---

### Q13: Offline Downloads Architecture
* **File:** `mobile/lib/services/download_service.dart` (lines 22–90, 240–280)
* **File Location:** `<docDir>/zenify_downloads/audio/<trackId>.mp4` (or `.m4a`/`.opus`).
* **File Size:** Explicitly tracked and stored as `fileSizeBytes` in `DownloadedSong`! Also queryable via `File(audioPath).lengthSync()`.
* **How Play is Flagged as Offline:**
  * `DownloadService.instance.isDownloaded(trackId)` returns boolean.
  * In `player_state.dart`, when starting playback, passing `offline: DownloadService.instance.isDownloaded(track.id)` into `ListeningTrackerService.instance.startTrack` correctly sets `offline: true`.

---

### Q14: Existing Theme & Glass Component Library
* **File:** `mobile/lib/design_system/widgets/apple_glass.dart` (lines 513–560), `mobile/lib/design_system/widgets/glass_surface.dart`
* **Widgets Available:**
  * `AppleGlass(borderRadius: BorderRadius.circular(...), child: ...)`
  * `LiquidGlass(...)`
  * `GlassSurface(...)`
  * `AppleDock(...)`
  * Accent colors: `kAppleRed` (`Color(0xFFFA2D48)`), `Academic Maroon` (`Color(0xFF9E2339)`), `Radiant Crimson` (`Color(0xFFE11D48)`).
  * System fonts: `SF Pro` and `SF Pro Display`.

---

### Q15: Android Build Configuration
* **File:** `mobile/android/app/build.gradle.kts` (lines 10–35)
* **`compileSdk`:** `36`
* **`minSdk`:** `24`
* **`targetSdk`:** `34`
* **Java/JVM Target:** Java 17 (`JavaVersion.VERSION_17`, `JvmTarget.JVM_17`).
* **Desugaring:** Currently NOT enabled.
* **Notification Note:** When adding `flutter_local_notifications` in Phase 11, enable core library desugaring in `build.gradle.kts`:
  ```kotlin
  compileOptions {
      isCoreLibraryDesugaringEnabled = true
  }
  dependencies {
      coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
  }
  ```

---

### Q16: Existing Tests & Conventions
* **File:** `mobile/test/` (22 test suites)
* **Conventions:**
  * `TestWidgetsFlutterBinding.ensureInitialized()` in `main()`.
  * `testWidgets(...)` and unit `test(...)` with `expect(...)`.
  * Clean mock state / in-memory storage implementations (e.g. `MemoryLibraryStorage` in `library_store_test.dart`).
  * `Provider` injection in widget trees.
  * Execution command: `cd mobile; flutter test test/<suite>_test.dart`.
  * Analysis command: `cd mobile; dart analyze <target>`.

---

## 2. THE GAP LIST & CHOSEN RESOLUTIONS

| # | Data Gap | Features Affected | Status in Codebase Today | Chosen Resolution (Phase & Strategy) |
|---|---|---|---|---|
| **G1** | `ListenEvent` journal rotation/wipe | All Replay (F1–F27) | `drainJournal()` deletes uploaded lines from `listen_journal.jsonl` | **Phase 1 Fix:** Decouple upload sync queue from the persistent local journal file. The local journal remains immutable and append-only. |
| **G2** | Loop-one mode logging | F9 (On Repeat) | `loopOne` parameter missing from `ListeningTrackerService.startTrack()` | **Phase 1 Fix:** Add `bool loopOne = false` to `startTrack()` and pass `PlayerState.repeatMode == RepeatMode.one`. |
| **G3** | Playlist `createdAt` timestamp | F23 (Created Playlists) | `UserPlaylist` does not have `createdAt` | **Phase 1/5 Fix:** Add nullable `DateTime? createdAt` to `UserPlaylist`. Set `DateTime.now()` on new creations. Render `null` for legacy ones (no fake dates). |
| **G4** | Indivisible artist names splitting | F5 (Top Artists) | `MediaNormalizer.splitArtistNames` splits `AC/DC`, `Tyler, The Creator`, `Simon & Garfunkel` | **Phase 2/5 Fix:** Add allowlist in `MediaNormalizer` and seed asset to keep compound artist names intact. |
| **G5** | Composers, Singers, Movie title | F6 (Roles & Movie Album) | Not present in YouTube Music raw playback streams | **Phase 2 Layered Resolver:** L1 script detection + L2 curated seed asset (`artist_seed.json`) + L3 backend `POST /meta/enrich` (MusicBrainz/Wikidata). Enforce 60% coverage threshold (`ReplayDataGap` widget). |
| **G6** | Country origin ISO | F12 (Music Geography) | Not present in raw streams | **Phase 2 Resolver:** Resolved via artist origin country in L2 seed + L3 enrichment. Enforce 60% coverage threshold. |
| **G7** | Release year / Era | F13 (Era & Decades) | Inconsistently populated in stream metadata | **Phase 2 Resolver:** Extract from album year where available (L0) + L3 enrichment. Enforce 60% coverage threshold. |
| **G8** | Offline playback flag propagation | F25 (Offline Data Saved) | `ListeningTrackerService.startTrack()` accepts `offline` bool, but caller in `player_state.dart` leaves it default `false` | **Phase 1 Fix:** Pass `offline: DownloadService.instance.isDownloaded(track.id)` when `player_state.dart` calls `startTrack`. |
| **G9** | Deep link URL routes | F17 (Match), F18 (Gift) | `AndroidManifest.xml` only registers `/room` path prefix | **Phase 10 Fix:** Add `/match`, `/gift`, `/replay` path prefixes to `AndroidManifest.xml`. |
| **G10**| Local Notifications Plugin | F27 (Weekly Digest) | `flutter_local_notifications` not in `pubspec.yaml` | **Phase 11 Dependency Request:** Submit formal dependency request for `flutter_local_notifications` + `timezone` + Android core library desugaring. |

---

## 3. PHASE 0 GATE VERIFICATION CHECKLIST

- [x] **All 16 questions answered with verified code evidence, exact paths, line numbers, and signatures.**
- [x] **Zero "probably", "likely", or guesses.**
- [x] **Gap List fully documented with precise resolutions for every gap.**
- [x] **Zero feature code written in Phase 0.**
- [x] **Status ledger `REPLAY_STATUS.md` initialized with all 27 features at `NOT_STARTED`.**
- [x] **Stopping for user review and approval before beginning Phase 1.**
