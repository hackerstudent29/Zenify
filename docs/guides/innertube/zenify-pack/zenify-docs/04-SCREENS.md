# 04. Screens

Legend: **T** = tab root, **P** = pushed, **M** = modal. Every screen implements: loading (skeleton), empty, error (retry), offline states.

## Sitemap

- **Tabs:** Home `/`, Explore `/explore`, Library `/library`, Search `/search`
- **Pushed:** Section `/section/:type`, Artist `/artist/:id`, Album `/album/:id`, Playlist `/playlist/:id`, Liked `/liked`, Downloads `/downloads`, Device `/local`, Day Mix `/day-mix`, Blend Hub `/blend`, Blend Detail `/blend/:id`, Together Hub `/together`, Together Room `/together/:code`, Profile `/profile`, Notifications `/notifications`, Settings `/settings`, Diagnostics `/settings/diagnostics`
- **Modals:** Full Player, Queue, Lyrics, Studio FX, Sleep Timer, Share, Login/Onboarding, Room Settings

---

## 1. Home (T)

Sliver scaffold, bouncing physics.
1. Top bar: avatar (→ Profile), greeting by clock, search shortcut (switches to Search tab and focuses), notification bell with badge (→ Notifications)
2. Hero carousel: full-bleed banners, page dots, auto-advance 5 s
3. Quick Picks: 4-row column grid, horizontal paging, tap = play, long-press = menu
4. Daily Mixes + Day Mix row: snap cards, "Made for [slot]" card first
5. Trending Now: card carousel
6. Top Artists: circular avatars + Follow
7. Jump Back In: recent albums/playlists shelf

## 2. Explore (T)

1. Large title "Explore"
2. Blend + Together entry cards (→ hubs)
3. Browse categories grid (Pop, Hip-Hop, Indie, Classical, Rock, Tamil, Telugu, Hindi, Punjabi, EDM) with gradient tiles
4. Moods row: Chill, Workout, Focus, Commute, Party, Sleep
5. Charts, New Releases shelves

## 3. Library (T)

1. Large title, avatar
2. Quick links list: Playlists, Liked Songs, Downloads, On This Device, Blends, Recent Rooms
3. Recently Added grid (2 col), sort toggle (Recent / A-Z)
4. "New Playlist" action (modal for name + cover)

## 4. Search (T)

1. Sticky glass search bar: voice trigger, clear, 300 ms debounce
2. Idle: recent searches (removable chips), trending tags, browse grid, moods
3. Results with segmented control: All (top match + sections), Songs, Artists, Albums, Playlists
4. Autocomplete suggestions list while typing

## 5. SectionDetail (P)

Collapsing hero (name, description, count) · filter/sort pills (Popularity, Release Date, A-Z) · infinite `MediaCard` grid (2-4 cols) with skeletons and pagination.

## 6. Artist (P)

1. Collapsing hero: photo, verified badge, monthly listeners, Follow
2. Play + Shuffle buttons
3. Top Songs table: tabs Popular / Newest / A-Z; rank number → equalizer when playing; thumbnail, title, album link, duration, menu; "Show more"
4. Albums carousel (year badge)
5. Singles & EPs carousel
6. Appears On / Collaborations
7. Fans Also Like (circular)
8. Biography + metadata

## 7. Album (P)

1. Header: cover with shadow, title, artist link, genre, year, track count, runtime
2. Actions: Play, Shuffle, Save heart, Download
3. Numbered tracklist: index, title, featured artists, explicit badge, duration, menu
4. Copyright/label footer
5. More by [Artist] shelf

## 8. Playlist (P)

1. Header: 4-cover mosaic or custom cover, title, creator, count, duration, public/private
2. Actions: Play, Shuffle, Edit (modal), Share, Delete (confirm)
3. In-playlist search
4. `ReorderableListView`: drag handle, swipe-to-delete, tap = play
5. Recommended songs drawer with one-tap Add

## 9. Liked Songs (P)

Crimson gradient header (heart, count, total duration) · Play All / Shuffle All / Offline-only switch · in-collection search · table with date favorited, artist links, multi-select (batch add to playlist, remove, download).

## 10. Device Library (P)

1. Scanner header: file count, storage used, Rescan
2. Tabs: Tracks, Artists, Albums, Folders
3. Track list: ID3 art, bitrate, format badge (MP3, FLAC, AAC, WAV, M4A)
4. Plays via file URI, no network. Needs `READ_MEDIA_AUDIO` permission screen.

## 11. Day Mix (P)

1. Clock-driven hero: Morning Fresh 05-11, Afternoon Groove 11-17, Sunset Chill 17-21, Night Owl 21-01, Midnight Deep 01-05
2. Slot selector carousel to preview other slots
3. Tracklist 25-50 tracks

## 12. Blend Hub (P)

Header "Shared Taste · Updated Daily" · Create Blend (share sheet link) · Join Blend (code/link input) · Active Blends shelf with match %.

## 13. Blend Detail (P)

Compatibility ring (animated 0-100%) · mutual top genres/artists · 50-song shared list with "You"/"[Friend]" badges · 24 h refresh countdown.

## 14. Together Hub (P)

Host New Session (opens Room Settings: DJ vs Collab mode) · Join by 6-char code (auto-caps) · Recent Rooms with reconnect · feature cards (sync, queue, chat).

## 15. Together Room (P, fullscreen)

1. Header: room code pill (tap to copy), listener count, DJ badge, Leave
2. Synced master player with scrubber driven by server timecode
3. Presence bar with DJ crown
4. Shared queue: DJ mode (host controls) or Collab mode (everyone adds/reorders)
5. Chat drawer
6. Emoji reactions (❤️ 🔥 🎉 💃 💯) spawning flying bubbles on all screens

## 16. Full Player (M)

1. Top bar: dismiss chevron, "Playing from …", menu
2. Ambient background from palette
3. Cover canvas with 3D tilt and shadow
4. Metadata: marquee title, tappable artist, like heart
5. Scrubber with elapsed/remaining, slow-scrub on vertical drag, haptics
6. Transport: shuffle, previous, play/pause, next, repeat (Off/All/One)
7. Dock: Studio FX, Lyrics, Output picker (system + Cast), Queue

## 17. Studio FX (M sheet)

1. Master bypass + presets (Flat, Bass Boost, Treble Boost, Vocal Boost, EDM, Acoustic, Night Mode)
2. 10-band EQ, ±12 dB at 32, 64, 125, 250, 500, 1k, 2k, 4k, 8k, 16k Hz
3. Convolution reverb: None, Studio, Room, Cathedral, Warehouse + wet/dry
4. 8D panner: on/off, direction, speed
5. Karaoke: Original ↔ Vocal Suppression ↔ Vocal Solo
6. Speed 0.5-2.0x and pitch ±12 semitones
7. Echo: delay, feedback, mix
8. Night mode / dynamics: threshold, ratio

## 18. Lyrics (M)

1. Header: quality badge, Romanization switch (Original / Tanglish / Hinglish), timing offset stepper (0.1 s), close
2. Karaoke canvas: active line bold/glow, others 40%, word-level highlight when available, tap-to-seek
3. Plain-text fallback

## 19. Queue (M sheet)

Header (count, Clear, repeat/shuffle) · Now Playing card with equalizer · Next In Queue (user priority; drag, swipe-remove) · Next From [context] · History tab (last 50).

## 20. Settings (P)

1. Profile summary
2. Streaming and download quality (Wi-Fi / Cellular: 128k, 256k, 320k)
3. Playback: crossfade 0-12 s, gapless, normalization, autoplay similar
4. Sleep timer: 15m, 30m, 45m, 1h, End of Track, 60 s fade
5. Storage and cache: usage, max cache slider, Clear cache
6. Explicit content filter
7. About: version, build, licenses, terms
8. Diagnostics (see `09-ROADMAP-TESTING.md`)

## 21. Extra screens

- **Profile:** avatar, name, stats (listening time, top artists), Edit, link to Settings.
- **Notifications:** list grouped by day (blend updates, room invites, new releases).
- **Login/Onboarding:** 3 intro pages, sign-in, language/genre picks (seeds Quick Picks).
- **Downloads:** progress rows, pause/resume, storage total, Wi-Fi-only toggle.
- **Sleep Timer sheet, Share sheet, Room Settings sheet.**
