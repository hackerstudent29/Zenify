# Website & Mobile App Settings Parity Matrix

This document provides a comprehensive mapping between every setting/control in the Zenify web frontend (`frontend/src/components/settings/SettingsModal.tsx`) and its equivalent implementation in the Zenify Flutter mobile app, adhering to **17-AUTH-SETTINGS-INSIGHTS-PROMPT.md** and **CLAUDE.md**.

## Scope Legend
- **A (Account)**: Synced via backend API (`PUT /api/auth/preferences` or `PUT /api/me/settings`). Persisted per-user across all devices and web.
- **D (Device)**: Device-scoped local storage (`SharedPreferences` / `flutter_secure_storage`). Never leaves the local client.
- **Web Only**: Feature specific to desktop web browser capabilities (e.g. physical keyboard binding).

---

## 1. Audio Controls

| Website Control | Website Behavior | App Row / Implementation | Scope | Sync Endpoint | Status |
|---|---|---|---|---|---|
| **Streaming Fidelity** | PopUp: `low` (Basic 96k), `high` (High 160k), `lossless` (Best 320k). Saves to `preferences.audioQuality` and `localStorage['zenify_audio_quality']`. | **Streaming quality (Wi-Fi)**: Cupertino Segmented Control (128 / 256 / 320 kbps). Maps to native ExoPlayer bitrate/stream selector. | A | `PUT /api/auth/preferences` (`audioQuality`) | Planned |
| *(Web has 1 fidelity setting)* | Single quality setting applied globally on web. | **Streaming quality (Cellular)**: Cupertino Segmented Control (128 / 256 / 320 kbps). Separate mobile bandwidth threshold. | A | `PUT /api/me/settings` (`cellularQuality`) | Planned |
| *(Mobile specific)* | N/A (Web does not support offline track caching). | **Download quality**: Cupertino Segmented Control (128 / 256 / 320 kbps). Dictates offline cached asset bitrate. | A | `PUT /api/me/settings` (`downloadQuality`) | Planned |
| **Same Volume** | Toggle: Peak volume normalizer via Web Audio API compressor. | **Volume normalization**: CupertinoSwitch. Applied in native DSP audio processor chain. | A | `PUT /api/auth/preferences` (`normalizeVolume`) | Planned |
| **Hide Bad Words** | Toggle: Filters explicit tracks and metadata across views. | **Explicit content**: CupertinoSwitch. Filters explicit flags from search and shelf queries. | A | `PUT /api/auth/preferences` (`explicitFilter`) | Planned |
| **Spatial Audio (8D Rotation Speed)** | AppleSlider: 20 to 500 ms (spatial rotation frequency) via Web Audio panner. | **Studio FX / Spatial Engine**: Link row opening the Studio FX Sheet with custom 8D rotation & reverb controls. | D | N/A (DSP on device) | Planned |
| *(Mobile specific)* | N/A | **Mono audio**: CupertinoSwitch. Downmixes stereo to mono in native audio processor. | D | N/A (DSP on device) | Planned |
| *(Mobile specific)* | N/A | **Gapless playback**: CupertinoSwitch. Seamless ExoPlayer transition buffer. | A | `PUT /api/me/settings` (`gaplessPlayback`) | Planned |

---

## 2. Playback Controls

| Website Control | Website Behavior | App Row / Implementation | Scope | Sync Endpoint | Status |
|---|---|---|---|---|---|
| **Smooth Swaps (Crossfade)** | Toggle (4s on/off). Sets `preferences.crossfade` and `localStorage['zenify_crossfade']`. | **Crossfade**: Precision spring slider (0 to 12 seconds; 0 = disabled). Engine crossfader in native Media3. | A | `PUT /api/auth/preferences` (`crossfade`) | Planned |
| **Keep Playing (Autoplay)** | Toggle: Fetches similar tracks when the queue terminates. | **Autoplay similar music**: CupertinoSwitch. Invokes `ApiService.fetchRelated` on queue completion. | A | `PUT /api/auth/preferences` (`autoplay`) | Planned |
| **Hide Details When Idle** | Toggle: Hides player controls after 5 seconds of idle cursor. | **Hide Details When Idle**: CupertinoSwitch. Auto-dims player controls during fullscreen playback after 5 seconds of touch inactivity. | D | N/A (Device UI state) | Planned |
| *(Mobile specific)* | Web sleep timer exists in header/player menu. | **Sleep timer**: Picker row (15m / 30m / 45m / 1h / End of track) with 60s gentle fade-out. | D | N/A (Device timer) | Planned |
| *(Mobile specific)* | N/A | **Pause when headphones disconnect**: CupertinoSwitch. Android `AudioManager.ACTION_AUDIO_BECOMING_NOISY` receiver. | D | N/A (Device audio) | Planned |
| *(Mobile specific)* | N/A | **Resume where you left off**: CupertinoSwitch. Restores active queue, track, and playback position on app launch. | D | N/A (Device cache) | Planned |
| *(Mobile specific)* | Web displays romanized lyrics dynamically. | **Lyrics: default script**: Segmented Control (Original / Tanglish / Hinglish). Dictates default lyrics rendering mode. | A | `PUT /api/me/settings` (`lyricsDefaultScript`) | Planned |
| *(Mobile specific)* | N/A | **Lyrics: text size**: Slider row adjusting typography scale in `LyricsSheet`. | D | N/A (Device UI state) | Planned |

---

## 3. Aesthetics & Appearance

| Website Control | Website Behavior | App Row / Implementation | Scope | Sync Endpoint | Status |
|---|---|---|---|---|---|
| **Main Color (Accent Color)** | PopUp: `rose`, `white`, `violet`, `cyan`, `emerald`, `amber`, gradients. Saves to `preferences.accentColor`. | **Accent Color**: Swatch picker supporting Academic Maroon Red (`#9E2339`), Radiant Crimson (`#E11D48`), Rose, Cyan, Emerald, Violet, Amber. | A | `PUT /api/auth/preferences` (`accentColor`) | Planned |
| **Dynamic Page Background (Artwork Colored Background)** | Toggle: Vibrant artwork-extracted mesh background on page headers. | **Use album colors in player**: CupertinoSwitch. Extracts dynamic palette from track artwork for ambient player glow. | D | N/A (Shader / canvas) | Planned |
| **Reactive Canvas Background** | Toggles for surfaces (`fullPlayer`, `trackPage`, `albumPage`, `artistPage`, `other`). Fluid WebGL mesh. | **Fluid Mesh Background**: CupertinoSwitch. Activates Apple Music-style fluid shader background in full player. | D | N/A (Device shader) | Planned |
| **Less Motion (Reduced Motion)** | Toggle: Suppresses fluid mesh canvas rAF loops and UI transitions. | **Reduce motion**: CupertinoSwitch. Replaces continuous springs with instant or subtle short alpha fades. | D | N/A (Device accessibility) | Planned |
| *(Mobile specific)* | Web defaults to dark theme. | **Theme**: Cupertino Segmented Control (System / Dark / Light). | D | N/A (Device UI) | Planned |
| *(Mobile specific)* | N/A | **Glass effects**: CupertinoSwitch. Controls live `BackdropFilter` glassmorphism vs solid dark surface for low-end device optimization. | D | N/A (Device rendering) | Planned |
| *(Mobile specific)* | N/A | **Haptics**: CupertinoSwitch. Enables/disables spring and slider haptic feedback. | D | N/A (Device motor) | Planned |

---

## 4. Notifications

| Website Control | Website Behavior | App Row / Implementation | Scope | Sync Endpoint | Status |
|---|---|---|---|---|---|
| **Email Notifications** | Toggle: Saves to `preferences.emailNotifications`. | **Email Notifications**: CupertinoSwitch. General system announcements. | A | `PUT /api/auth/preferences` (`emailNotifications`) | Planned |
| **Weekly Summary Email** | Toggle: Saves to `preferences.weeklySummaryEmail`. | **Weekly Summary Email**: CupertinoSwitch. Weekly digest of listening stats and insights. | A | `PUT /api/auth/preferences` (`weeklySummaryEmail`) | Planned |
| **New Music (New Release Alerts)** | Toggle: Alerts when followed artists release music. | **New releases from artists I follow**: CupertinoSwitch. Triggers local notifications from resilient artist scanner. | A | `PUT /api/auth/preferences` (`newReleaseAlerts`) | Planned |
| **Playlist News (Playlist Updates)** | Toggle: Alerts when followed playlists are updated. | **Playlist News**: CupertinoSwitch. Informs when curated or followed playlists add new tracks. | A | `PUT /api/auth/preferences` (`playlistUpdates`) | Planned |
| *(Mobile specific)* | Web uses Web Push API (`/api/me/push-subscriptions`). | **Allow notifications**: System permission link. Requests Android 13+ `POST_NOTIFICATIONS` with educational rationale. | D | N/A (System permission) | Planned |
| *(Mobile specific)* | N/A | **Blend updates**: CupertinoSwitch. Daily Blend refresh notification. | A | `PUT /api/me/settings` (`notifyBlendUpdates`) | Planned |
| *(Mobile specific)* | N/A | **Together invites**: CupertinoSwitch. Real-time notifications for incoming Together listening room invites. | A | `PUT /api/me/settings` (`notifyTogetherInvites`) | Planned |
| *(Mobile specific)* | N/A | **Product news**: CupertinoSwitch. In-app remote configuration announcements. | A | `PUT /api/me/settings` (`notifyProductNews`) | Planned |

---

## 5. Privacy & Personalization

| Website Control | Website Behavior | App Row / Implementation | Scope | Sync Endpoint | Status |
|---|---|---|---|---|---|
| **Personalized Experience** | Toggle: Saves to `preferences.personalizationEnabled` and calls `PUT /api/activity/personalization`. | **Personalized Experience**: CupertinoSwitch. Uses listening history to power Quick Picks, Daily Mixes, and Home shelves. | A | `PUT /api/activity/personalization` | Planned |
| **Show Activity** | Toggle: Saves to `preferences.listeningActivity`. Displays currently playing track on public profile. | **Show Activity on Profile**: CupertinoSwitch. Displays real-time listening status on user profile. | A | `PUT /api/auth/preferences` (`listeningActivity`) | Planned |
| **Clear Listening History** | Button: `DELETE /api/activity/history`. Permanently deletes listening events and taste affinities. | **Clear listening history**: Destructive button with iOS confirm sheet. Calls `DELETE /api/activity/history` and resets Insights rollups. | A | `DELETE /api/activity/history` | Planned |
| *(Mobile specific)* | N/A | **Save listening history**: CupertinoSwitch. When OFF, native engine records 0 events (no journal, no SQLite, no sync). | A | `PUT /api/me/settings` (`saveListeningHistory`) | Planned |
| *(Mobile specific)* | N/A | **Private session**: CupertinoSwitch. Temporary privacy toggle; suppresses tracking until turned off or app restart. | D | N/A (Device tracking gate) | Planned |
| *(Mobile specific)* | N/A | **Profile visibility**: Cupertino Segmented Control (Public / Friends / Private). Controls Blend and Together visibility. | A | `PUT /api/me/settings` (`profileVisibility`) | Planned |
| *(Mobile specific)* | N/A | **Show top artists on profile**: CupertinoSwitch. Controls whether top Insights artists appear on profile. | A | `PUT /api/me/settings` (`showTopArtistsOnProfile`) | Planned |
| *(Mobile specific)* | N/A | **Share anonymous playback errors**: CupertinoSwitch. Controls opt-in `FailureReporter` telemetry. | D | N/A (Device logging) | Planned |

---

## 6. Desktop Shortcuts (Web Only)

| Website Control | Website Behavior | App Equivalent | Scope | Reason |
|---|---|---|---|---|
| **Keyboard Shortcuts** | Interactive recorder: Playback (Space, K), Seeking (Left/Right, J/L), Volume (Up/Down, M), Interface (F, L, Q). | **Web Only (Desktop Keyboard)** | Web Only | Not applicable on mobile touch interface. Mobile provides lockscreen playback notifications, media session buttons, and gesture controls. |

---

## 7. Account & Profile

| Website / Existing Mobile | Feature Details | App Row / Implementation | Scope | Sync Endpoint | Status |
|---|---|---|---|---|---|
| **Profile Card** | Avatar, Display Name, Username, Role. | **Profile Header**: Tap-to-edit row showing avatar, name, email. Opens edit sheet (Name, Username with live availability check, Bio, Avatar image picker + crop). | A | `PATCH /api/auth/profile`, `POST /api/auth/avatar` | Planned |
| **Email Address** | Email display. | **Email**: Value + chevron row. Tap opens sheet to change email address via OTP sent to the new address. | A | `POST /api/auth/request-otp`, `POST /api/auth/verify-otp` | Planned |
| **Linked Accounts** | Google OAuth linking. | **Sign-in methods**: Displays Google and Email link status. Allows linking/disconnecting Google (blocked if only method). | A | `POST /api/auth/google`, `DELETE /api/auth/identities/google` | Planned |
| **Active Devices** | Session list from `/api/auth/sessions`. | **Devices**: Active session cards with device name, platform, app version, last used timestamp. Revoke button per session and "Sign out everywhere". | A | `GET /api/auth/sessions`, `DELETE /api/auth/sessions/:id` | Planned |
| **Export My Data** | N/A | **Export my data**: Generates full GDPR-compliant JSON dump and opens native OS Share Sheet. | A | `GET /api/me/export` | Planned |
| **Sign Out** | Clears cookies / JWT tokens. | **Sign out**: Revokes current session on server, clears `flutter_secure_storage`, options to preserve offline downloads. | A | `POST /api/auth/logout` | Planned |
| **Delete Account** | `DELETE /api/auth/account`. | **Delete account**: Destructive action requiring recent re-auth (<5 min) and typing "DELETE". Hard cascades across all tables. | A | `DELETE /api/auth/account` | Planned |

---

## 8. Downloads & Storage (Mobile Specific)

| Row | Control | Scope | Function |
|---|---|---|---|
| **Download over Wi-Fi only** | CupertinoSwitch | D | Halts and pauses download worker queue when connected to cellular data. |
| **Storage used** | Spring-filled segmented bar | D | Visualizes distribution of Cached Audio, Downloaded Tracks, and Free Storage. |
| **Maximum cache** | Slider (500 MB - 10 GB) | D | Sets hard limit for dynamic LRU cache eviction in `CacheService`. |
| **Clear audio cache** | Button with confirm dialog | D | Wipes streaming disk cache (`DefaultCacheManager`) while strictly preserving pinned downloads. |
| **Remove all downloads** | Destructive Button | D | Confirms and removes all offline encrypted tracks and metadata from device disk. |

---

## 9. Content & Regional Preferences

| Control | Description | Scope | Sync Endpoint |
|---|---|---|---|
| **Music country** | Picker selecting country (India, US, UK, UAE, etc.). Refetches trending charts and localized catalogs. | A | `PUT /api/auth/preferences` (`selectedCountryCode`) |
| **Preferred languages** | Multi-select chips (Tamil, Telugu, Hindi, Malayalam, Punjabi, English, etc.). Weights Home shelves and Quick Picks. | A | `PUT /api/auth/preferences` (`languages`) |

---

## 10. Social (Together & Blend)

| Control | Description | Scope | Sync Endpoint |
|---|---|---|---|
| **Default room mode** | Segmented Control: `DJ` (Host only) vs `Collab` (Open queue). Default mode when hosting Together rooms. | A | `PUT /api/me/settings` (`defaultRoomMode`) |
| **Who can invite me** | Segmented Control: `Everyone` vs `Friends Only`. Controls incoming Together room and Blend session invites. | A | `PUT /api/me/settings` (`whoCanInvite`) |

---

## 11. About & Support

| Control | Description | Scope | Implementation |
|---|---|---|---|
| **Version & build** | Value display (`v2.5.3 (Build 42)`). Tap 7 times reveals hidden Diagnostics screen. | D | Reads package info (`package_info_plus`). |
| **Check for updates** | Button checking remote config version against current build. | D | `RemoteConfigService.checkForUpdates()` with in-app APK installer prompt. |
| **Send feedback** | Button opening native composer sheet. | A | `POST /api/feedback` with app version and opt-in diagnostic logs. |
| **Open-source licenses** | Link row | D | Opens Flutter license viewer plus NewPipeExtractor / InnerTube notice. |
| **Terms of Service** | Link row | D | In-app Chrome Custom Tab loading terms URL. |
| **Privacy Policy** | Link row | D | In-app Chrome Custom Tab loading privacy policy URL. |
| **Diagnostics** | Link row (unlocked via 7 taps) | D | Inspects audio engine stats, buffer health, DNS resolution, and circuit breaker state. |

---

## Summary & Verification
1. **Total Web Controls Mapped**: 100% of website controls in `SettingsModal.tsx` have direct mobile equivalents or explicit desktop-only classification.
2. **Endpoint Consistency**: Reuses existing `/api/auth/preferences`, `/api/activity/personalization`, and `/api/activity/history` endpoints so preferences seamlessly synchronize between the web browser and the mobile app.
3. **Local-First Synchronization**: Instant local optimistic update with automatic asynchronous background retry and conflict resolution per key timestamp.

