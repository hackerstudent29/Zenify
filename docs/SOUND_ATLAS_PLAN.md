# Sound Atlas — Complete Feature & Data Blueprint

> **Vision:** Turn music discovery into an interactive world tour — combining an animated globe, Apple Music editorial design, and a collectible musical passport, built **strictly using real data Zenify can actually fetch and verify**.

---

## 1. What Data We Actually Have (Verified Live)

Before designing any section, every piece of Sound Atlas is matched to a real, working source:

| Data Needed | Exact Source We Can Actually Use | Real Limitation / Note |
|---|---|---|
| **Songs, Albums, Playlists, Videos per Language / Style** | **InnerTube (YouTube Music)** — Category pages (Tamil, Hindi, Malayalam, K-Pop, Latin, Pop, Jazz, Electronic, Folk, etc.) + filtered search (`Songs`, `Albums`, `Artists`, `Playlists`) | YouTube organizes hubs by **genre/language**, not by city name. Each city uses curated language + scene search combinations. |
| **Song Popularity vs. Underground / Hidden Gems** | **InnerTube play/view counts** shown on songs & playlists (e.g. `403 plays`, `78K plays`, `1.2M plays`, `138M views`) | Lets us filter out huge 50M+ hits and genuinely surface smaller independent tracks (e.g. under 1M plays). Extremely local musicians not on YouTube Music won't appear. |
| **Artist Details & Monthly Audience** | **InnerTube Artist Pages** — gives `monthlyListenerCount`, subscriber count, bio, Top Songs, Albums, Singles/EPs, Videos, Live Performances, Similar Artists, and instant Radio | Works cleanly for any artist with a YouTube Music channel. |
| **Artist Home City / Country Origin** | **MusicBrainz API** (free, no key needed) + **Curated City Registry** in Zenify's database | Gives real `begin-area` & `country` (verified e.g. `A. R. Rahman -> Chennai, IN`). Incomplete for brand-new bedroom indie artists, so we combine it with a curated list. |
| **Weekly Language & Country Charts** | **InnerTube Charts** — `Trending 20`, `Daily Top Music Videos`, `Top 100 Music Videos`, `Top 40 Artists`, and **7 India Weekly Top 100 Language Charts** (Tamil, Hindi, Telugu, Punjabi, Haryanvi, Bhojpuri, International) | YouTube does **not** expose automatic "City Top 50" (like "Top 50 in Madurai") or native Monthly/Yearly charts. City charts combine country/language charts + city queries + Zenify plays. |
| **City Skyline Photos & Short Descriptions** | **Wikipedia / Wikimedia REST API** (free, high-res) + curated city metadata in Zenify's backend | InnerTube only returns album/artist covers, not city photographs. Wikipedia gives crisp city landmark photos once per city and we cache them on our server. |
| **Passport Stamps, Battle Votes, Postcards, Zenify Trends** | **Zenify's Own Server & Postgres Database** (plus existing listening history, achievements, and share-card generator) | 100% controlled by us. Only tracks real Zenify user activity (privacy-safe, no GPS needed). |

---

## 2. Pages, Layout & Components

Everything follows Zenify's existing **Apple Music editorial aesthetic** (SF Pro typography, dynamic blurred artwork backgrounds, `DynamicIslandHeader`, horizontal snapping carousels, spring press feedback, and clean bottom sheets — **no clunky boxy maps or cluttered pins**).

### Page 1: Sound Atlas Home (Main Discovery Hub)

Designed like an interactive travel magazine layered over a dark glowing globe:

1. **Dynamic Island Header (`DynamicIslandHeader`)**:
   - Title: `Sound Atlas`
   - Top-right quick buttons: **My Passport** pill (shows stamp count, e.g. `12`) and **"Take Me Somewhere New"** spin button.
2. **Hero Interactive Globe / World Canvas**:
   - Smooth touch-to-spin 3D-style stylized globe painted natively in Flutter (`CustomPainter`) — dark glass ocean, glowing continents, soft city beacons color-coded by vibe:
     - **Coral Red (`Trending`)** — hot right now on Zenify & charts
     - **Neon Mint (`Underground`)** — active indie/emerging scenes
     - **Warm Gold (`Heritage`)** — traditional, folk & classical roots
     - **Electric Blue (`New Sounds`)** — fresh local releases
   - **Zooming & Dragging**: Drag freely across regions; pinch or tap a region pill (`South Asia`, `East Asia`, `Europe`, `Latin America`, `North America`, `Africa & Middle East`) to smoothly fly the camera there and reveal city beacons.
   - **Quick Filter Strip directly under the Globe**:
     - Mode toggle pills: `All` · `Trending` · `Underground` · `Heritage` · `New Releases`
     - Genre/Language spotlight pills: `Tamil`, `Hindi`, `Malayalam`, `K-Pop`, `Latin`, `Jazz`, `Electronic`, `Folk` — tapping one dims unrelated cities and illuminates matching cities on the globe!
3. **"Take Me Somewhere New" Spotlight Card**:
   - Full-width frosted glass action strip. Tapping spins the globe smoothly to an unexplored city far from the user's usual taste, pops open that city, and immediately starts playing its local station.
4. **City of the Day** (Editorial Hero Banner):
   - Full-bleed city landmark photograph with gradient fade, city + country kicker (`SOUND ATLAS · INDIA`), 1-line musical identity, and instant **Play City Station** button.
5. **Musical Journeys Carousel** (`MediaCard` landscape cards):
   - Story-driven multi-city trails with stop count & progress bar (e.g. *Sounds of Asia — 3/8 stops*).
6. **Discovery Radar & Hidden Gems Section**:
   - Includes the **Discovery Preference Slider** (`0% Popular` ↔ `100% Undiscovered`) right at the top of the shelf.
   - Sliding toward *Undiscovered* dynamically refreshes the track & artist row with lower-playcount indie artists instead of mega-hits.
7. **This Week's City Sound Battle**:
   - Compact two-city matchup card (e.g., *Chennai vs Mumbai* or *Tokyo vs Seoul*) with instant listen previews for each side and live Zenify community vote percentages.
8. **Your Sound Passport Summary Strip**:
   - Shows cities unlocked, countries visited, tracks discovered, and a preview row of your latest collected stamps.

---

### Page 2: City Sound Profile (Opened from Globe or Search)

Feels like opening an Apple Music curated editorial city guide:

1. **Cinematic City Header**:
   - High-res cached landmark photo (`Wikipedia/Wikimedia`) + `ArtworkMeshBackground` ambient glow.
   - Overlays: `SOUND ATLAS · COUNTRY`, large bold City Name, tagline (e.g. *"Gaana, Kollywood & Carnatic roots meet raw Tamil indie"*), genre/language tags, and stamp status badge (`Stamp Collected ✓` or `Listen to 2 tracks to unlock stamp`).
   - Primary Controls: **Play City Mix** button, **Shuffle** button, and **Create Postcard** + **Host in Room Together** action buttons!
2. **Local Discovery Mode Switcher (Sticky Pill Bar)**:
   - `Overview` · `Popular` · `Underground` · `Heritage` · `Time Machine`
   - Switching tabs smoothly swaps the tracks/playlists below without leaving the city.
3. **City Local Charts & Playlists**:
   - Local-scene songs (`SongTile` list with play counts visible) + official regional playlists (`Featured playlists` & `New Music` from InnerTube).
4. **Emerging & Independent Artists Row**:
   - Circular artist portraits sorted/filtered for independent and rising artists from that city's music scene.
5. **Famous Legends & Heritage Music Row**:
   - Iconic artists verified via `MusicBrainz` / curated seed + traditional/folk recordings (e.g., *Carnatic classical* for Chennai, *Enka/City Pop* for Tokyo, *Fado* for Lisbon).
6. **City Time Machine (Built-in Decade Strip)**:
   - Clean horizontal pills inside the city: `1960s` · `1970s` · `1980s` · `1990s` · `2000s` · `Today`.
   - Tapping a decade loads era-matched tracks & albums for that city/region via InnerTube + decade tags (with a short editorial note explaining that era's sound).
7. **Live Stamp Progress Bar (Sticky Subtle Pill while listening)**:
   - Shows *"1/2 songs heard to stamp Chennai"* and triggers a celebratory rubber-stamp animation when unlocked.

---

### Page 3: Sound Passport (Collectibles & Progression)

1. **Passport Cover Card**:
   - Explorer Rank title (*Traveler → Nomad → Cartographer → World Maestro* based on unlocked stamps).
   - 4 tabular counters: **Cities**, **Countries**, **Genres**, **Tracks Explored**.
2. **Passport Stamps Grid**:
   - Custom vintage-style ink stamp badges per city (locked stamps shown as faint silhouettes with the unlock rule: e.g. *"Listen to 2 tracks for 30s"*).
   - Tapping any collected stamp opens your **"Visited Memories"** — when you unlocked it and which tracks you discovered there.
3. **Exploration Achievements**:
   - *First 5 Cities*, *10 Countries Explored*, *5 Different Genres*, *20 Independent Artists (<1M plays)*, *Complete 1 Musical Journey*, *Vote in 5 City Battles*.

---

### Page 4: Musical Journey View (Guided Travel Mode)

1. **Story Intro Sheet**: Editorial cover + short history of the route + total stops & reward stamp preview.
2. **Interactive Mini-Globe Header**: Shows animated dotted flight path connecting every stop (Stop 1 → Stop 2 → Stop 3...).
3. **Stop Cards**: Each stop unlocks as you listen, displaying:
   - Why this city matters for that journey
   - 3–5 playable tracks pulled live from InnerTube
   - Next stop auto-advance option so it plays smoothly like an audio documentary.

---

### Page 5: City vs City Sound Battle Sheet

- Side-by-side split view with each city's photo, tagline, and a **5-track mini playlist** fetched fresh from InnerTube.
- Users must play at least **1 track preview** before locking in their vote (prevents blind clicking).
- Live community percentage bar updates immediately after voting (stored cleanly in Zenify's backend).

---

### Page 6: Sound Postcards (Shareable Creation)

- Opens from any City Profile.
- Lets user pick:
  1. City Landmark Photo (or album mosaic fallback)
  2. **3 to 5 favorite tracks** they discovered in that city
  3. A short personal note (up to 140 chars)
- Renders a crisp, Apple-styled **PNG Postcard** (using the same reliable image-capture pattern already built in Room Together Recaps) + a playable `https://listenzenify.vercel.app/atlas/postcard/<id>` deep link shared via Android's native share sheet.

---

## 3. How to Make It Much More Interactive (Not Just a Static Page)

1. **Instant Audio Arrival**: Tapping any city on the globe plays a subtle crossfade into that city's signature radio right away — you *hear* a place as soon as you land on it.
2. **Spring-Physics Globe Fly-To**: When tapping *"Take Me Somewhere New"* or advancing to the next stop in a Musical Journey, the globe physically spins across latitude/longitude with spring deceleration and pulses the arrival beacon.
3. **Earned Stamps (Anti-Fake Clicking)**: Stamps only unlock after **30+ seconds of real playback across 2+ songs** from that city. A custom haptic buzz + animated ink-stamp drop makes unlocking feel genuinely rewarding.
4. **Live Discovery Slider Feedback**: Dragging the *Popular ↔ Undiscovered* slider updates track play counts right in front of the user (so moving it to `85% Underground` visibly swaps `138M views` tracks for `18K plays` / `45K plays` indie finds).
5. **One-Tap "Listen Together from Here"**: Inside any City Profile or Musical Journey, users can tap **"Start Room Together with this City"** — immediately launching a live synchronized Zenify listening room pre-loaded with that city's queue so friends can explore Tokyo or Chennai together.
6. **City vs City Audio Duel**: Play a 15-second or full snippet of City A, switch to City B, then vote right inside the player card.

---

## 4. Benefits for Zenify

- **Solves "Same-Song Echo Chamber"**: Most streaming homepages loop the user's top 20 songs. Sound Atlas turns discovering unfamiliar Tamil indie, Japanese City Pop, Korean R&B, or Berlin electronics into a game.
- **Zero Extra Licensing/API Cost**: Powered by our existing InnerTube setup, free Wikipedia landmark images, free MusicBrainz origin checks, and Zenify's own database.
- **High Retention Loop**: Daily *City of the Day*, weekly *City Battles*, and multi-stop *Musical Journeys* give listeners a reason to open the app even when they don't know what song they want.
- **Organic Social Sharing**: Shareable **Sound Postcards** act as free word-of-mouth marketing whenever users share *"5 tracks from Tokyo"* with a Zenify link.

---

## 5. Honest Suggestions: What to Keep, Modify, or Remove from the Draft

### Suggested Modifications (Makes It Realistic & Much Better)
1. **Start with 30–40 Signature Cities instead of "Every City on Earth"**:
   - YouTube Music doesn't label songs by city automatically. Creating 30–40 rich, hand-seeded cities (Chennai, Mumbai, Kochi, Hyderabad, Bengaluru, Delhi, Kolkata, Tokyo, Seoul, Taipei, Bangkok, London, Berlin, Paris, Madrid, Lisbon, Lagos, Nairobi, Cairo, New York, Los Angeles, Atlanta, Chicago, Detroit, New Orleans, Rio, Mexico City, Buenos Aires, Bogotá, etc.) ensures **every pin feels curated, accurate, and alive**.
2. **Merge "Sound Time Machine" inside each City Profile**:
   - Instead of building a huge standalone timeline engine, put a crisp `1960s · 1970s · 1980s · 1990s · 2000s · Today` switcher right inside City Profiles. Decades work cleanly with InnerTube queries and album years without breaking on obscure eras.
3. **Simplify "Genre DNA Map" into 8 Global Roots**:
   - Connect ~8 major roots (*Electronic, Indie, Hip-Hop, Jazz, Folk/Heritage, Film Soundtracks, Latin, K-Pop/J-Pop*) across your 30–40 featured cities so users can trace real musical paths (e.g., *Jazz: New Orleans → Chicago → New York → London → Tokyo*) without overwhelming clutter.
4. **Upgrade "Community Votes" from Illustrative to Real**:
   - Skip fake placeholder percentages — store real Zenify user votes cleanly on the server from Day 1, and label battles clearly as **Zenify Community Votes**.

### Suggested Additions
- **Language Filter Right on the Globe**: Since you also want strong per-language discovery (*Tamil, Hindi, Malayalam, Korean, Spanish, English*), add a **Languages** strip right beside genres on the Sound Atlas globe so tapping `Tamil` highlights Chennai + Jaffna/Colombo/Singapore diaspora Tamil scenes, `Malayalam` highlights Kochi, `Korean` highlights Seoul, etc.
- **"Save City Playlist to Library"**: One tap turns any City Profile or Journey into a saved playlist in the user's Zenify Library.
- **Room Together Integration**: Direct button to open a shared listening room loaded with the city you're exploring.

### Suggested Removals / Deferrals (Because Data Isn't Reliably Available)
1. **Remove Live GPS "City Sound Pulse Heatmap"**:
   - We cannot get real-time per-city streaming telemetry from YouTube Music across arbitrary global cities, and Zenify shouldn't track users' live GPS locations unnecessarily. Replace it with **Zenify Trends by Country & Featured City** aggregated cleanly from anonymous Zenify play counts once enough users are active.
2. **Remove Automated "Local City Top 50" Claims for Every Town**:
   - Only label something **"Official Chart"** where InnerTube genuinely has a chart (Country Top 100 / India Weekly Language Top 100). For city profiles, label it **"Chennai Local Picks / Scene Top 50"** so users aren't misled.
3. **Remove Offline Unsigned Street-Artist Discovery**:
   - Hidden Gems works using YouTube Music's real indie uploads + low play counts (`1K–500K plays`). Artists who have never distributed tracks onto YouTube/YouTube Music simply don't exist in any InnerTube response.

---

## 6. Final Section List: Exactly What We Will Have vs. What We Leave Out

### A. Final Sections We CAN Fetch & Build Live

| # | Section / Feature | Exact Data Source | Phase |
|---|---|---|---|
| 1 | **Interactive Spinning Globe & Regional Filters** | Flutter `CustomPainter` + Curated 30–40 City Coordinates + Genre/Language Tags | **V1** |
| 2 | **City of the Day & "Take Me Somewhere New"** | Curated City Seed + Wikipedia City Photo + Zenify Listening History (picks fresh city) | **V1** |
| 3 | **City Sound Profiles** (Local songs, emerging/indie, heritage, featured playlists, albums, local artists, city radio) | InnerTube Search/Categories + InnerTube Artist Pages + InnerTube Next/Radio + MusicBrainz artist origin + Cached Wikipedia Landmark Photos | **V1** |
| 4 | **Language & Genre Spotlight Highlights on Map** | InnerTube Category Hubs (`Tamil`, `Hindi`, `Malayalam`, `K-Pop`, `Latin`, `Pop`, `Jazz`, `Electronic`, etc.) mapped onto matching cities | **V1** |
| 5 | **Hidden Gems Radar + Discovery Slider (0%–100%)** | InnerTube Song/Video/Artist results ranked & filtered by real play count (`<500K` / `<1M` plays) & artist subscriber count | **V2** |
| 6 | **Sound Passport & Exploration Achievements** | Zenify Server DB tracking real verified playback time (`30s+` across `2+` tracks per city) | **V2** |
| 7 | **Musical Journeys (Guided Audio Routes)** | Curated Journey definitions in Zenify DB + live InnerTube tracks/playlists at each stop + map route animation | **V2** |
| 8 | **City vs City Sound Battles** | Paired City playlists from InnerTube/Curated Seed + real Zenify community voting stored in Postgres | **V3** |
| 9 | **Sound Time Machine (Decade Switcher inside Cities)** | InnerTube decade + city/genre queries + release year filtering (`1960s`–`Today`) | **V3** |
| 10 | **Genre DNA Connections** | Curated root-to-city relationship graph + live InnerTube subgenre playlists per stop | **V3** |
| 11 | **Shareable Sound Postcards** | Flutter PNG Card Renderer (like Room Recap) + City Photo + 3–5 chosen InnerTube tracks + Deep Link (`zenify://atlas/...`) | **V3** |
| 12 | **Zenify Listening Trends (Country & Featured City Pulse)** | Aggregated anonymous play counts inside Zenify's existing `ListeningEvent` / `UserDailyStat` tables | **V4** |

### B. Items Left Out (Cannot Fetch Reliably / Not Available via InnerTube)

| Removed Item | Honest Reason |
|---|---|
| **Live External City Charts for Every City on Earth** | YouTube Charts only provides country charts (~71 countries) and 7 Indian language weekly charts — no per-city charts exist in InnerTube. |
| **Native Monthly / Yearly YouTube Charts** | InnerTube Charts only publishes Daily and Weekly rankings (we cover decades/years using album dates & curated era playlists instead). |
| **Live GPS User Heatmap** | Requires intrusive device GPS tracking and massive concurrent listeners per town to look real; replaced with privacy-safe Zenify play trends later. |
| **Artists Not Uploaded to YouTube Music** | All audio & metadata streams through InnerTube / clean CDNs; purely offline local artists without online releases cannot be fetched. |
