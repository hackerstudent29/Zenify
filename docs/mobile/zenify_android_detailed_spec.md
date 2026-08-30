# 💎 Zenify Android: The Ultimate Build Specification & Conversion Bible

This document is the absolute ground truth for building the **Zenify Native Android** application. It contains the complete design system, page-by-page logic, technical conversion guides, and all necessary environment keys.

---

## 🛠 1. The Zenify Tech Stack (Android Frameworks)
To match the performance and premium feel of the web app, use these specific libraries:

- **UI:** [Jetpack Compose](https://developer.android.com/compose) (Latest stable)
- **Navigation:** [Compose Navigation](https://developer.android.com/jetpack/compose/navigation)
- **Architecture:** MVVM (Model-View-ViewModel) with [Clean Architecture principles](https://developer.android.com/topic/architecture).
- **Core Engine:** [Media3 / ExoPlayer](https://developer.android.com/media/media3/exoplayer) (For background audio & high-res streaming).
- **Image Loading:** [Coil](https://coil-kt.github.io/coil/) (For high-speed artwork loading with transitions).
- **Dependency Injection:** [Koin](https://insert-koin.io/) (Lightweight and easy for Compose).
- **Networking:** [Retrofit 2](https://square.github.io/retrofit/) + [OkHttp 4](https://square.github.io/okhttp/).
- **Serialization:** [Kotlinx Serialization](https://github.com/Kotlin/kotlinx.serialization) (Matches the JSON output from your Node.js backend).
- **Local Storage:** [Room Database](https://developer.android.com/training/data-storage/room) (For caching metadata and search history).
- **Visual Effects:** [Palette API](https://developer.android.com/training/material/palette) (For dynamic color extraction from album art).

---

## 🔑 2. Environment & Infrastructure (The "Connection Keys")

| Key Name | Value / Link | Description |
| :--- | :--- | :--- |
| **API Base URL** | `https://zenify-production-7f21.up.railway.app/api` | The main backend entry point. |
| **Database URL** | `postgresql://postgres.hsxgtrqqnwghteqnsegg:Ramazendrum@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true` | Primary Supabase Direct Link. |
| **Cloudinary Endpoint** | `https://res.cloudinary.com/dzqcuxchc/` | Image and artwork storage. |
| **Google Client ID** | `362498893988-fnrqfrbcb6nbs2j2gvnev10qabc4c2en.apps.googleusercontent.com` | Used for Android Google Login integration. |
| **Gemini API Key** | `AIzaSyD15DsOwXALSkp-BtzmphCCSvgCXuHCL_kN` | Used for AI-powered playlist curation. |
| **Nvidia API Key** | `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` | AI features / LLM processing. |
| **ZenPay Public Key** | `pk_live_1920b1c7098c2180c706e6fdcbea` | Integration for premium subscriptions in-app. |

---

## 🎨 3. Design System: Converting Web UI to Android

### **Core Colors (Exact Tokens)**
- **BG_ZENIFY:** `Color(0xFF0A0A0B)` (Deep, dark obsidian)
- **SURFACE_ZENIFY:** `Color(0xFF121214)` (Sleek card surface)
- **PRIMARY_ROSE:** `Color(0xFFE11D48)` (Accent for interactive elements)
- **TEXT_PRIMARY:** `Color(0xFFF2F2F3)` (95% White)
- **TEXT_MUTED:** `Color(0xFF64666F)` (Medium-dark gray)

### **CSS to Jetpack Compose Dictionary**
- `flex items-center` -> `Row(verticalAlignment = Alignment.CenterVertically)`
- `grid grid-cols-2` -> `LazyVerticalGrid(columns = GridCells.Fixed(2))`
- `rounded-2xl` -> `shape = RoundedCornerShape(16.dp)`
- `backdrop-blur-xl` -> `Modifier.blur(24.dp)` (On Android 12+, use RenderEffect).
- `@apply active:scale-95` -> `Modifier.clickable { ... }.scale(interactionSource.collectIsPressedAsState())`

---

## 🏁 4. Page-by-Page Detailed Blueprint

### **Page 1: Splash & Onboarding**
- **Elements:**
    - Animated Logo: `LottieAnimation` using `zenify_logo.json`.
    - Hero Text: "Listen to the Soul." (36sp, ExtraBold, Centered).
    - Subtext: "The ultimate premium music experience." (16sp, Muted).
    - Navigation: Primary Rose Button "Start Discovery".
- **Logic:** Calls `api.get('/auth/verify')`. If the user is logged in, use `NavHost` to pop the splash and enter `Home`.

### **Page 2: Login & Signup (The Gateway)**
- **Layout:** Vertical column with 32.dp horizontal padding.
- **Components:**
    - Elegant logo at the top (80dp height).
    - `ZenifyTextField`: Outlined, Rose focus border, Rounded 12dp.
    - Buttons: "Login" (Solid Rose), "Google Signup" (Bordered, White Logo).
- **Endpoint:** `POST /auth/login` and `POST /auth/register`.
- **Text:** "Continue with email", "New to Zenify? Create account".

### **Page 3: Home Feed (Dynamic Discovery)**
- **Header:** Sticky top bar with "Zenify" logo and User Profile Icon.
- **Feed Sections (Mapped to Backend /homepage routes):**
    1. **Featured Albums (Carousel):** Large `Card` with `AsyncImage`. Clicking a card triggers a `SharedElement` transition to the Album Page.
    2. **Recently Played:** 2-column grid of track thumbnails.
    3. **AI Recommendations:** A personalized row powered by Gemini API tags.
- **Animations:** Subtle parallax effect on the Featured carousel.

### **Page 4: Search & Categories**
- **Interaction:** Tap search bar to open full keyboard; real-time results update as you type.
- **Elements:**
    - Result List: `Tracks`, `Artists`, `Playlists`.
    - Category Grid: "Relax", "Workout", "Party", "Focus".
- **Endpoint:** `GET /search/all?q={query}`.

### **Page 5: Immersive Player (The Masterpiece)**
- **Visuals:**
    - **Palette Extraction:** Load the album art, extract dominant color, and apply as a large `Brush.verticalGradient` overlaying the Black background.
    - **Rotating Disk:** Option to have the cover art rotate slowly like a vinyl.
    - **Synced Lyrics:** A vertically scrolling list. The active line is "Glow White" (#FFFFFF), others are 40% opaque.
    - **Controls:** Glassmorphic control cluster with Rose Play/Pause button.
- **Advanced Feature:** "StudioFX" Menu - A custom 5-band equalizer built using `Visualizer` and `Media3` Effect processors.

### **Page 6: Profile & Premium Checkout**
- **Display:** User stats (Total listening time), Subscription status.
- **Premium Cards:** Using the Gold Gradient (FDE68A -> F59E0B). 
- **Payment Logic:** Integrate ZenPay SDK using the provided Public Key.
- **Endpoint:** `GET /profile` and `POST /payment/session`.

---

## 🛡 5. Error Prevention & Stability Guide

### **Common Pitfalls and How to Fix Them:**
1. **State Sync Error:**
   - *Problem:* Web app updates state in Zanzibar; Android app doesn't see it.
   - *Fix:* Use `RefreshLayout` (Swipe to Refresh) on Home and Library to force API re-fetch.
2. **Audio Stalling:**
   - *Problem:* App killed in background.
   - *Fix:* Implement a "Foreground Service" using **MediaSessionService** from Media3. This prevents Android OS from killing the playback.
3. **Image Flickering:**
   - *Problem:* Images reload on every recomposition.
   - *Fix:* Use `rememberImagePainter` from Coil to cache textures in memory.
4. **JWT Expiration:**
   - *Problem:* API calls start failing with 401.
   - *Fix:* Use an OkHttp `Authenticator` that automatically calls `/auth/refresh` when a 401 is received, then retries the original request seamlessly.

---

## 📈 6. Conversion Success Metrics
- **Aesthetics Check:** Does it have the Rose accent? Is it Black/Zinc?
- **Performance:** Does the page load under 500ms?
- **Parity:** Does it have all the same playlists as the Web version? 

**Everything is now in this file. You are ready to Build.**
