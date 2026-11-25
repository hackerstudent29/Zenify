# Zenify Replay & Insights — Comprehensive Developer Manual & Feature Guide

> **Everything you need to know about the Zenify Replay & Insights architecture, mathematical rules, all 27 features, UI components, backend routes, and customization instructions.**

---

## 1. System Philosophy & Design System

Zenify Replay & Insights is an Apple Music-inspired editorial analytics and celebration suite. It combines deep listening metrics with social virality, gamified trophies, interactive trivia, and seamless 320kbps audio playback.

### 1.1 Brand Foundations & Design Tokens
* **Academic Maroon Red (`#9E2339`)**: Signature brand color in Light Mode.
* **Radiant Crimson (`#E11D48`)**: High-contrast brand color in Dark Mode (`AppTheme.brand`).
* **Universal Neutral Dark Charcoal (`#121214`)**: Default dark background with zero blue tint (`AppTheme.bgDark`).
* **Elevated Neutral (`#18181B`)**: Card container and surface background (`AppTheme.surfaceDark`).
* **Typography**:
  * **Headings, Display & Section Titles**: `Oswald` (`font-oswald`, uppercase, bold/black).
  * **Body Text, Labels, Data Tables & Descriptions**: `Libre Franklin` (`font-libre`, medium/regular).
* **Signature Action Buttons**:
  ```dart
  // Standard Zenify Signature Action Button
  Container(
    height: 40,
    padding: const EdgeInsets.symmetric(horizontal: 20),
    decoration: BoxDecoration(
      color: const Color(0xFF18181B),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: Colors.white.withOpacity(0.10)),
    ),
    child: Center(
      child: Text(
        'LABEL',
        style: TextStyle(
          color: AppTheme.brand,
          fontSize: 10,
          fontWeight: FontWeight.bold,
          letterSpacing: 1.5,
        ),
      ),
    ),
  )
  ```

---

## 2. Core Mathematical Rules & Invariant Definitions

Every feature across the application relies on these standardized rules (never redefine or alter these without updating tests):

| Term | Exact Definition | Explanation |
|---|---|---|
| **Qualified Play** | `listenedMs >= min(30,000 ms, 50% of durationMs)` | A play only counts towards play counts if the user listened for at least 30 seconds (or half the song for short tracks). |
| **Play Count** | $\sum \text{Qualified Plays}$ | Short previews and skips under 30s do NOT increment play count. |
| **Listened Time** | $\sum \text{listenedMs}$ | Total active listening time across ALL plays (even short plays contribute their active milliseconds). |
| **Skip** | `userAdvanced && listenedMs < min(30,000 ms, 50% of durationMs)` | When a user hits next/prev or scrubs out before the qualified threshold. |
| **Completed Play** | `endedNaturally \|\| listenedMs >= 90% of durationMs` | Track played to natural completion or user listened to $\ge 90\%$ of length. |
| **Completion Rate** | $\frac{\text{Completed Plays}}{\text{Total Started Plays}} \times 100$ | Deep-listening focus metric. |
| **Local Time** | `startedAtUtc + tzOffsetMin` | All calendar, daypart, weekday, and hour calculations must use the listener's local device wall-clock time. |

### 2.1 Hour Boundary Splitting (`splitMsAcrossHours`)
When a song starts at `10:55 PM` and ends at `11:15 PM` (20 minutes):
* The `10 PM` hour bucket gets **5 minutes** (Evening / Late Night).
* The `11 PM` hour bucket gets **15 minutes** (Late Night).
Plays are never lazily credited to the start hour alone.

### 2.2 Heatmap Intensity Quartiles
Heatmap intensity levels (0 to 4) are computed on **non-zero days only** using quartiles:
* **Level 0**: $0\text{ ms}$ (No listening)
* **Level 1**: $> 0\text{ ms}$ up to 25th percentile ($Q_1$)
* **Level 2**: $> Q_1$ up to 50th percentile ($Q_2$ / Median)
* **Level 3**: $> Q_2$ up to 75th percentile ($Q_3$)
* **Level 4**: $> Q_3$ (Top listening days)

### 2.3 Largest Remainder Method (`roundPercentsTo100`)
To prevent percentage breakdowns from summing to $99\%$ or $101\%$:
1. Compute raw percentage floats: e.g. `[52.4, 27.6, 12.3, 7.7]`
2. Take integer floors: `[52, 27, 12, 7]` (Sum = 98, remainder = 2)
3. Calculate fractional remainders: `[.4, .6, .3, .7]`
4. Distribute the $+1$ increments to the largest remainders (`.7` and `.6`):
   Result: **`[52, 28, 12, 8]`** (Sum = $100\%$ exact).

---

## 3. Feature-by-Feature Reference (F1 through F27 + Add-ons)

### F1: Favorite Daypart & Exact Peak Hour
* **Widget**: `mobile/lib/features/replay/presentation/widgets/daypart_card.dart`
* **Data**: `hourMs[0..23]`, `daypartMs[Daypart]`.
* **Logic**: Bins active listening into 4 periods:
  * `Late Night`: 10:00 PM – 4:59 AM
  * `Morning`: 5:00 AM – 11:59 AM
  * `Afternoon`: 12:00 PM – 4:59 PM
  * `Evening`: 5:00 PM – 9:59 PM
* **Visuals**: 24-bar interactive histogram with highlighted peak hour bar, total time, and share percentage.

### F2: GitHub-Style Listening Heatmap Calendar
* **Widget**: `mobile/lib/features/replay/presentation/widgets/heatmap_calendar.dart`
* **Data**: `dayMap[dayKey] = {ms, topTrackId}`.
* **Logic**: 5-level green/crimson heat squares arranged in weeks $\times$ 7 days.
* **Interaction**: Tapping any day opens `DayDetailSheet` displaying total listened duration and the #1 song for that day.

### F3: Day-of-Week Personality & Bar Chart
* **Widget**: `mobile/lib/features/replay/presentation/widgets/day_of_week_card.dart`
* **Data**: `weekdayMs[Monday..Sunday]`.
* **Claim Condition**: Shows archetype (e.g. *"Weekend Warrior"*, *"Midweek Melophile"*) if the anchor day accounts for $\ge 18\%$ of total time across $\ge 3$ distinct weeks.

### F4: Period Delta Comparison
* **Widget**: `mobile/lib/features/replay/presentation/widgets/period_delta_pill.dart`
* **Data**: Current period aggregate vs Previous equivalent period aggregate.
* **Calculations**:
  $$\Delta \% = \frac{\text{Current} - \text{Previous}}{\text{Previous}} \times 100$$
* **Visuals**: Clean badges showing green $\uparrow$ or red $\downarrow$ for both listening hours and play counts.

### F5: Top Artists
* **Widget**: `mobile/lib/features/replay/presentation/widgets/top_artists_section.dart`
* **Data**: `ArtistStat` list ranked by plays desc $\rightarrow$ listenedMs desc.
* **Visuals**: Editorial list with circular artist artwork, total plays, hours listened, and percentage of overall library time.

### F6: Composers, Playback Singers & Movie Breakdown
* **Widget**: `mobile/lib/features/replay/presentation/widgets/composers_singers_section.dart`
* **Data**: Enriched from `TrackMetaStore` (`composers`, `singers`, `movie`).
* **Visuals**: Tabbed breakdown celebrating Indian cinema music culture (Kollywood, Tollywood, Bollywood) — top music directors (e.g. Anirudh, A.R. Rahman), singers (e.g. Sid Sriram, Shreya Ghoshal), and movies.

### F7: Top Songs
* **Widget**: `mobile/lib/features/replay/presentation/widgets/top_songs_section.dart`
* **Data**: `SongStat` list ranked by qualified plays.
* **Audio Integration**: Tapping any song or the "PLAY ALL" button immediately queues and plays high-fidelity audio via `PlayerState.setQueue`.

### F8: Top Album Spotlight
* **Widget**: `mobile/lib/features/replay/presentation/widgets/top_album_card.dart`
* **Data**: `AlbumStat` with total plays, listened time, and album completion percentage.

### F9: On Repeat & Heavy Rotation
* **Widget**: `mobile/lib/features/replay/presentation/widgets/on_repeat_section.dart`
* **Logic**: Identifies tracks played $\ge 3$ consecutive times within a session, tracks with `loopOne == true`, or tracks with high repeat density ($\ge 5$ plays in 48 hours).

### F10: Skip Hall of Fame
* **Widget**: `mobile/lib/features/replay/presentation/widgets/skip_hall_of_fame_card.dart`
* **Data**: Tracks with the highest skip count and skip rate ($\ge 60\%$).
* **Visuals**: Transparent, humorous insight showing tracks the user quickly passes over.

### F11: Discovery & New Found Artists
* **Widget**: `mobile/lib/features/replay/presentation/widgets/discovery_section.dart`
* **Data**: Compares artist plays in the current period against `AllTimeIndexStore`.
* **Logic**: An artist is "New Found" if their very first play occurred during the selected period.

### F12: Music Geography
* **Widget**: `mobile/lib/features/replay/presentation/widgets/music_geography_section.dart`
* **Data**: Track origin country derived from `TrackMeta.country`.
* **Visuals**: World region distribution bar chart and country badges (India, USA, UK, South Korea, etc.).

### F13: Era & Decades Breakdown
* **Widget**: `mobile/lib/features/replay/presentation/widgets/decades_breakdown_section.dart`
* **Data**: `TrackMeta.year` binned into decades: 1960s, 70s, 80s, 90s, 2000s, 2010s, 2020s.

### F14: Artist Loyalty Timeline
* **Widget**: `mobile/lib/features/replay/presentation/widgets/loyalty_timeline_card.dart`
* **Data**: Historical playback progression for the user's #1 artist, showing months active, listening milestones, and loyalty rank.

### F15: Gamified Trophy Room
* **Widget**: `mobile/lib/features/replay/presentation/widgets/milestones_trophy_room.dart`
* **Badges**:
  1. **1,000 Minutes Club**: Listened to 1,000+ minutes.
  2. **10,000 Minutes Titan**: Listened to 10,000+ minutes.
  3. **Century Club**: 100+ unique songs played.
  4. **Centurion 500**: 500+ unique songs played.
  5. **Polyglot**: Listened to songs in $\ge 3$ distinct languages.
  6. **Night Owl**: $\ge 30\%$ of music played during Late Night (10 PM – 5 AM).
  7. **Early Bird**: $\ge 25\%$ of music played during Morning (5 AM – 10 AM).
  8. **Loyalist**: Over 50 plays for a single artist.
  9. **Explorer**: Over 50 new artists discovered in a single period.
  10. **Marathoner**: Continuous listening session exceeding 3 hours.
* **Features**: Progress rings, category filtering (Time, Discovery, Dedication), and celebration dialogs with shareable triggers.

### F16: Milestone Moments Ticker
* **Widget**: `mobile/lib/features/replay/presentation/widgets/milestone_moments_card.dart`
* **Data**: Tracks exact historical milestones:
  * Song #1 ever played
  * Song #500 and #1,000
  * Day with the most music ever played

### F17: Replay Match & Musical Battle
* **Widget**: `mobile/lib/features/replay/presentation/social/replay_match_screen.dart`
* **Backend**: `POST /replay/match` in `backend/src/routes/replay.routes.ts`
* **Logic**:
  $$\text{ArtistOverlap} = \frac{\sum \min(w_{1,a}, w_{2,a})}{\sum \max(w_{1,a}, w_{2,a})}$$
  $$\text{TrackOverlap} = \frac{|T_1 \cap T_2|}{|T_1 \cup T_2|}$$
  $$\text{TasteMatch} = 0.5 \cdot \text{ArtistOverlap} + 0.3 \cdot \text{TrackOverlap} + 0.1 \cdot \text{Daypart} + 0.1 \cdot \text{Genre}$$
  $$\text{BattleScore} = 0.5 \cdot \text{Hours} + 0.3 \cdot \text{Discovery} + 0.2 \cdot \text{UniqueArtists}$$

### F18: Dedicate / Gift a Song
* **Widget**: `mobile/lib/features/replay/presentation/social/dedicate_song_sheet.dart`
* **Backend**: `POST /replay/gift` & `GET /replay/gift/:token`
* **Service**: `GiftService.createGiftCard(...)`
* **Features**: Attach a 140-character personal note to any song, generate a cryptographic token, and share a clean web card link (`https://zenify.app/gift/:token`).

### F19: Story Walkthrough (Replay Stories)
* **Widget**: `mobile/lib/features/replay/presentation/story/story_walkthrough_screen.dart`
* **Features**: 6 full-screen animated story cards (Top Artist, Top Song, Listening Minutes, Daypart, Badges, Summary). Features progress bars, haptic feedback, background music playback, and tap-left/tap-right navigation.

### F20: Replay Quiz (Interactive Trivia)
* **Widget**: `mobile/lib/features/replay/presentation/quiz/replay_quiz_screen.dart`
* **Questions**:
  1. What was your most played song?
  2. Who was your #1 artist?
  3. How many total hours did you spend listening?
  4. Which part of the day was your favorite?
  5. What was the first song you played this period?

### F21: Replay Historical Archive
* **Widget**: `mobile/lib/features/replay/presentation/archive/replay_archive_sheet.dart`
* **Service**: `ReplayArchiveService`
* **Features**: Allows users to revisit finalized Replay snapshots from previous months and years.

### F22: Play Replay Mix
* **Service**: `ReplayMixService.createReplayPlaylist(...)`
* **Features**: One-tap button on ReplayScreen that bundles the user's Top 25/50 songs into a permanent, offline-capable Zenify playlist inside `LibraryStore`.

### F23: Created Playlists Spotlight
* **Widget**: `mobile/lib/features/replay/presentation/widgets/created_playlists_section.dart`
* **Data**: Reads directly from `LibraryStore.instance.playlists` and computes total plays originating from user playlists.

### F24: Liked Songs Spotlight
* **Widget**: `mobile/lib/features/replay/presentation/widgets/liked_songs_spotlight.dart`
* **Data**: Cross-references played songs with `LibraryStore` liked tracks.

### F25: Offline Data Saved
* **Widget**: `mobile/lib/features/replay/presentation/widgets/offline_data_saved_card.dart`
* **Calculation**:
  $$\text{Data Saved (MB)} = \frac{\text{Offline Listened Seconds} \times 320\text{ kbps}}{8 \times 1024}$$

### F26: Private Listening & Exclusion Mode
* **Widget**: `mobile/lib/features/replay/presentation/widgets/private_listening_sheet.dart`
* **Store**: `ExclusionStore`
* **Features**: Exclude specific tracks, playlists (e.g. Sleep sounds, White noise, Kids playlists), or toggle a temporary incognito session.

### F27: Weekly Digest
* **Service**: `WeeklyDigestService`
* **Features**: Generates a lightweight summary card suited for notifications and Monday morning digest popups.

### Add-on Cards
* **First Song Card**: Displays the inaugural song played during the selected time period.
* **Marathon Session Card**: Details the listener's longest uninterrupted listening streak.
* **Languages Bar Card**: Displays percentage splits across Indian and global languages.
* **Completion Focus Card**: Visualizes deep listening vs superficial skimming.
* **Listener Personality Card**: Awards playful badges like "Acoustic Alchemist", "Night Owl", or "Sonic Explorer".

---

## 4. How to Modify and Customize

### 4.1 Modifying Replay Screen UI & Layout
Open `mobile/lib/features/replay/presentation/replay_screen.dart`.
* **To reorder sections**: Scroll to `_buildContent()` (around line 340). All widgets are assembled in a clean `ListView`. Simply reorder the widgets in the list.
* **To add a new card**: Create your widget inside `mobile/lib/features/replay/presentation/widgets/my_new_card.dart`, take `ReplayAggregate` as a parameter, and add it to `_buildContent()`.
* **To modify the Period selector**: The periods are configured in `_buildPeriodSelector()` using `ReplayPeriod.values`.

### 4.2 Altering Mathematical Calculations
Open `mobile/lib/features/replay/domain/replay_engine.dart`.
* **To change the qualified play threshold**: Modify `isQualifiedPlay(ListenEvent e)`.
* **To adjust daypart hours**: Update `daypartOfHour(int hour)`.
* **To modify peak hour calculation**: Check `_computeDayparts(events)`.

### 4.3 Adding New Trophy Badges
Open `mobile/lib/features/replay/presentation/widgets/milestones_trophy_room.dart`.
* In `_computeBadges()`, add a new `ReplayBadge(...)` instance specifying `title`, `description`, `icon`, `category`, `target`, `currentProgress`, `unit`, and `isUnlocked`.

### 4.4 Modifying Fastify Backend Routes
Open `backend/src/routes/replay.routes.ts`.
* The server uses standard Fastify route definitions.
* To change the taste matching algorithm, update the scoring logic in `fastify.post('/replay/match', ...)`.
* To deploy to production, run `npm run build` in the `backend/` directory.

### 4.5 Running Automated Tests
Run the entire Replay test suite from the `mobile/` directory:
```bash
flutter test test/replay/
```
Or run individual phase tests:
```bash
flutter test test/replay/phase3_aggregation_engine_test.dart
flutter test test/replay/phase10_social_viral_test.dart
```

---

## 5. File Manifest Summary

| Layer | Folder Path | File Count |
|---|---|---|
| **Domain** | `mobile/lib/features/replay/domain/` | 15 files |
| **Data** | `mobile/lib/features/replay/data/` | 6 files |
| **Presentation** | `mobile/lib/features/replay/presentation/` | 33 files |
| **Insights Adapter** | `mobile/lib/views/insights/` | 11 files |
| **Backend** | `backend/src/routes/replay.routes.ts` | 1 file |
| **Assets** | `mobile/assets/` | 1 seed catalog (`replay_track_meta_seed.json`) |
| **Automated Tests** | `mobile/test/replay/` | 12 files |
| **Documentation** | `docs/replay/` | 2 files (`README.md`, `PROJECT_STRUCTURE.md`) |
