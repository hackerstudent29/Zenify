# 🔘 Zenify Android: The Ultimate "Mega" Blueprint (Master Design & Build Document)

This document is the **Full, Unabridged Reference** for the Zenify Native Android application. It covers everything discussed in this conversation: brand identity, visual details, core logic, backend connectivity, technical conversion, and high-performance native implementations.

---

## 🏛 SECTION 1: PROJECT VISION & BRAND IDENTITY
**Zenify** is more than a music player; it is an immersive auditory experience designed to "Zenify" the listener's mood.

### **The Mission**
To transition the current Web/Capacitor hybrid app into a 100% Native Android experience using **Kotlin** and **Jetpack Compose**. The app must provide:
- **Zero-Latency Interactions:** Fluid 60fps animations.
- **Premium Aesthetics:** Monochromatic "Zinc/Black" with "Rose-600" accents.
- **Background Stability:** Uninterrupted audio playback via Android Foreground Services.
- **Immersive Visuals:** Dynamic UI responding to album artwork colors.

---

## 🔑 SECTION 2: TECHNICAL ARCHITECTURE & ENVIRONMENT

### **2.1 Backend & Cloud Infrastructure**
The app connects to the following production environments:

| System Component | Value / Link |
| :--- | :--- |
| **API Base URL** | `https://zenify-production-111.up.railway.app/api` |
| **Staging/Local API** | `http://10.0.2.2:3000/api` |
| **Frontend Public URL** | `https://listenzenify.vercel.app` |
| **Cloudinary Asset Storage**| `https://res.cloudinary.com/dzqcuxchc/` |
| **Supabase Database** | `[REDACTED_CONNECTION_STRING]` |
| **Supabase Dashboard** | `https://hsxgtrqqnwghteqnsegg.supabase.co` |

### **2.2 Environment Keys (Secure Storage)**
These keys are crucial for core functionality and must be stored in `local.properties`:

- **Google Client ID:** `[REDACTED_CLIENT_ID]`
- **Gemini AI API Key:** `[REDACTED_API_KEY]`
- **Nvidia API Key:** `[REDACTED_API_KEY]`
- **ZenPay Secret:** `[REDACTED_SECRET]`
- **ZenPay Public Key:** `[REDACTED_PUBLIC_KEY]`

### **2.3 The "Premium" Framework Stack**
To match the Zenify experience, use these libraries:
- **UI:** [Jetpack Compose](https://developer.android.com/compose)
- **Navigation:** [Compose Navigation](https://developer.android.com/jetpack/compose/navigation)
- **Audio Engine:** [Media3 / ExoPlayer](https://developer.android.com/media/media3/exoplayer)
- **Image Loading:** [Coil](https://coil-kt.github.io/coil/)
- **Networking:** [Retrofit 2](https://square.github.io/retrofit/) + [OkHttp 4](https://square.github.io/okhttp/)
- **Dependency Injection:** [Koin](https://insert-koin.io/)
- **Local Persistence:** [Room DB](https://developer.android.com/training/data-storage/room)
- **Serialization:** [Kotlinx Serialization](https://github.com/Kotlin/kotlinx.serialization)
- **Visuals:** [Palette API](https://developer.android.com/training/material/palette)

---

## 🎨 SECTION 3: THE GLOBAL DESIGN SYSTEM (DESIGN PARITY)

### **3.1 Colors (Exact HEX Tokens)**
The app uses a curated, monochromatic dark scale:
- **Primary Background:** `#0a0a0b` -> `Color(0xFF0A0A0B)`
- **Surface Elevation:** `#121214` -> `Color(0xFF121214)`
- **Surface Hover:** `#18181b` -> `Color(0xFF18181B)`
- **Primary Accent (Rose):** `#e11d48` -> `Color(0xFFE11D48)`
- **Text Primary:** `#ffffff` -> `Color(0xFFFFFFFF)`
- **Text Muted:** `#64666f` -> `Color(0xFF64666F)`
- **Premium Gold:** `Color(0xFFFDE68A)` to `Color(0xFFF59E0B)`

### **3.2 Typography Rules**
- **Brand Font:** Use "Outfit" or "Inter" from Google Fonts.
- **Title Styles:** ExtraBold, Spacing -0.05em (Gives a tight, premium look).
- **Body Styles:** Regular-Medium, Line height 1.5x.

### **3.3 Micro-Animations**
- **Pressed States:** All buttons should have a `Spring` scale animation (from 1.0 to 0.96).
- **Loading:** Use a Shimmer effect (`Modifier.placeholder`) on skeleton cards.
- **Transitions:** Use `HorizontalSlide` or `Fade` for screen navigation navigation.

---

## 📱 SECTION 4: PAGE-BY-PAGE DEEP DIVE (THE BLUEPRINT)

### **4.1 Splash Screen (First Impression)**
- **Visual Structure:**
    - Black background.
    - Centered Zenify Logo (Animated SVG path drawing).
    - Sub-logo text: "Listen to the Soul." (Fades in slowly).
- **Logic:**
    - Call `/auth/verify`. 
    - If valid JWT: Navigate to `MainContainer`.
    - If no JWT: Navigate to `Onboarding`.
- **Animations:** Logo "Breaths" (Subtle 1.0 to 1.05 expansion).

### **4.2 Onboarding Page**
- **Layout:** Full-screen imagery with a text overlay at the bottom 30%.
- **Elements:**
    - Background: High-quality music-themed image with a `GradientScrim` (Black at the bottom).
    - Header: "Music. Redefined."
    - Button: "Let's Start" (Large pill-shaped Rose button).
- **Animation:** `SlideUp` animation for the text and button cluster.

### **4.3 Authentication (Login & Sign Up)**
- **Layout:** Vertical column centered vertically.
- **Components:**
    - Header: "Login to Zenify"
    - `ZenifyTextField`: Outlined, 12dp rounded corners, Rose focus border.
    - `GoogleButton`: White button with Google Logo (Integration with `/auth/google`).
    - `LoginButton`: Solid Rose.
- **Texts:**
    - "New here? Create an account." (Link-style).
    - "Forgot password?" (Link-style).
- **Logic:** POST `/auth/login`. On error (401), show a `Shake` animation on the text field and a `Snackbar`.

### **4.4 Home Discover (The Feed)**
This is the main navigation destination.
- **Structure:**
    - **Top Bar:** Sticky "Zenify" logo + User Profile Button.
    - **Featured Horizon:** Horizontal list of large album cards.
    - **Recently Played Grid:** 2 columns of small track cards.
    - **Sections:** "Made for You", "New Releases", "Trending Now".
- **Logic:** Calls `/homepage/featured` and `/homepage/recently-played`.
- **Animations:** Parallax effect when scrolling the featured horizontal list.

### **4.5 Search & Explore**
- **Structure:**
    - **Search Input:** Rose cursor, glass background (`Modifier.blur(20.dp)`).
    - **Category Grid:** Tiles for Genres ("Chill", "Focus", "Party").
- **Real-time Results:**
    - Sectioned by Tracks, Artists, Albums.
    - `/search/all?q={query}`.
- **Logic:** Implement a `Flow` with `debounce(300)` for efficiency.

### **4.6 Immersive Full-Screen Player**
This is the core of the app.
- **Visual Layout:**
    - **Dynamic Mosaic Background:** Extract colors from the current album art using `Palette`. Create a shifting gradient that moves as the music plays.
    - **Album Artwork:** Large, 32dp rounded rectangle with a shadow glow.
    - **Marquee Title:** Track name scrolls horizontally if it's too long.
    - **Controls:** Glassmorphic control cluster (Shuffle, Prev, Play/Pause, Next, Loop).
- **Advanced Features:**
    - **StudioFX:** A 5-band equalizer tab with "Bass Boost" and "Virtualizer".
    - **Synced Lyrics:** Autoscrolling `.lrc` text. Current line is focused and highlighted.
- **Interaction:** Swipe down to minimize player into the `MiniPlayer`.

### **4.7 Mini-Player (Persistent UI)**
- **Structure:** A floating glass bar at the bottom (just above the Nav Bar).
- **Elements:** Small thumb artwork -> Track Title -> Play/Pause -> Skip.
- **Logic:** Visible globally except in the full-screen player.

### **4.8 Artist & Album Pages**
- **Hero Header:** Parallax artist/album photo. As you scroll up, the header dissolves into the TopBar.
- **Action Button:** Large Rose "Play" button at the header's baseline.
- **Track List:** Simple rows with Duration and Metadata.

---

## 📘 SECTION 5: THE CONVERSION HANDBOOK (WEB -> ANDROID)

To replicate your frontend exactly, map these mental models:

### **5.1 Layout Mapping**
| React/Next.js/HTML | Jetpack Compose Equivalent |
| :--- | :--- |
| `flex items-center` | `Row(verticalAlignment = Alignment.CenterVertically)` |
| `justify-between` | `Row(horizontalArrangement = Arrangement.SpaceBetween)` |
| `grid-cols-2` | `LazyVerticalGrid(columns = GridCells.Fixed(2))` |
| `p-4 m-2` | `Modifier.padding(16.dp).padding(8.dp)` |
| `z-50` | `Modifier.zIndex(50f)` |
| `rounded-3xl` | `shape = RoundedCornerShape(24.dp)` |

### **5.2 Theme Mapping**
| Tailwind Utility | Compose Modifier / Token |
| :--- | :--- |
| `bg-zinc-900/40` | `Modifier.background(Color(0xFF121214).copy(0.4f))` |
| `backdrop-blur-xl` | `Modifier.blur(24.dp)` (On supported APIs) |
| `shadow-premium` | `Modifier.shadow(elevation = 16.dp, shape = ...)` |
| `animate-pulse` | `InfiniteTransition.animateColor(...)` |
| `hover:scale-105` | `Modifier.pointerInput(...) { detectTapGestures(...) }` |

### **5.3 State Management Mapping**
| Web (Zustand/Redux) | Android (ViewModel/State) |
| :--- | :--- |
| `const { track } = usePlayer()` | `val currentTrack by viewModel.track.collectAsState()` |
| `playerStore.play()` | `viewModel.onEvent(PlayerEvent.Play)` |
| `useEffect(() => fetch...)` | `LaunchedEffect(Unit) { viewModel.loadData() }` |

---

## 🔐 SECTION 6: BACKEND INTEGRATION & API SURFACE

### **6.1 Request Interceptors**
- Every request must include the `Authorization: Bearer <JWT>` header.
- Implement an **Authenticator** for silent refresh:
    1. If Response Code == 401:
    2. Block outgoing requests.
    3. Call `/auth/refresh`.
    4. Update local token.
    5. Retry original request.

### **6.2 Core Endpoints to Implement**
- `GET /homepage/featured`: Returns list of albums for the top carousel.
- `GET /search/all?q=...`: Multi-entity search.
- `GET /tracks/{id}`: Fetch track metadata and stream URL.
- `GET /playlists/me`: Get current user's library.
- `POST /tracks/like`: Toggle heart icon.
- `GET /sync-lyrics/{id}`: Returns LRC structured data.

---

## 🛑 SECTION 7: STABILITY, PERFORMANCE & ERROR HANDLING

### **7.1 Offline First Meta**
- Cache all `Liked Songs` metadata in **RoomDB**.
- If no internet: Show the "Library" but disable the "Explore" tab.
- Show a custom `OfflineBanner` component.

### **7.2 Error Feedback**
- **Network Failure:** "Connection Lost. Retrying..." (Floating toast).
- **Authentication Failure:** Force redirect to Login screen.
- **Audio Stalling:** Show a subtle buffering spinner in the center of the Play/Pause button.

### **7.3 Performance Optimization**
- **Lazy List Keying:** Use stable IDs for `LazyColumn` items to prevent unnecessary recompositions.
- **Image Resizing:** Request specific widths from Cloudinary (e.g., `w_300`) to save bandwidth and memory.
- **Memory Management:** Ensure the `AudioService` is unbind-able to prevent leaks.

---

## 📦 SECTION 8: DEPLOYMENT & GO-LIVE CHECKLIST

1. **App Bundling:** Generate `.aab` for Play Store optimization.
2. **Proguard/R8:** Enable shrinking and obfuscation to protect API keys.
3. **Permissions:**
    - `INTERNET`
    - `POST_NOTIFICATIONS` (For Media Player controls)
    - `FOREGROUND_SERVICE`
    - `WAKE_LOCK` (Prevents music from stopping mid-song)
4. **App Signing:** Ensure the `Upload Key` is stored in a safe vault.
5. **Assets:** Include all SVG icons in high-resolution (Vector Drawables).

---

## 📝 SECTION 9: MASTER PROMPT FOR THE AI BUILDER

**Use the following prompt to tell Antigravity exactly how to build components:**

> "Using the Zenify Mega Blueprint, build the **Full-Screen Immersive Player** for our Android application. 
> 1. Use **Media3** for audio control.
> 2. Implement the **Palette API** to create a dynamic background from the artwork.
> 3. Add the **Synced Lyrics** vertically scrolling list using standard `.lrc` timing logic.
> 4. Ensure the **StudioFX** Equalizer button is accessible via a glassmorphic menu.
> 5. All UI must be in monochromatic **Zinc/Black** with a **Rose-600** accent. 
> 6. Match the visual parity of the Web app but use native Kotlin Compose animations (Spring, AnimatedVisibility)."

---

**[End of Mega Blueprint]**
