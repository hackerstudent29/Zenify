# 🎵 Zenify Android: The Ultimate Master Blueprint & Conversion Bible

This document is the absolute ground truth for building the **Zenify Native Android** application. It combines all project details, branding, technical specifications, and environment keys into a single, comprehensive reference.

---

## 🏛 I. Project Mission & Brand Identity
**Zenify** is a premium, immersive music experience. The Android app must not be a simple 'WebView' wrapper; it must be a high-performance, native masterpiece that feels fluid, responsive, and visually stunning.

- **Design Philosophy:** Monochromatic Black/Zinc with Rose (#E11D48) accents.
- **Goal:** Parity with the Zenify Web App but with native smoothness and background stability.

---

## 🔑 II. Technical Infrastructure (Environment Keys & Links)

These keys are essential for connecting the app to your existing cloud services.

| Resource | Value / Endpoint | Purpose |
| :--- | :--- | :--- |
| **Primary API URL** | `https://zenify-production-111f.up.railway.app/api` | Main backend entry. |
| **Staging/Local API** | `http://10.0.2.2:3000/api` | For Emulator local testing. |
| **Database URL** | `postgresql://postgres.hsxgtrqqnwghteqnsegg:Ramazendrum@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true` | Supabase Postgres Direct Link. |
| **Cloudinary Name** | `dzqcuxchc` | Media and artwork asset storage. |
| **Cloudinary API Key** | `863945965552634` | Backend authenticated uploads. |
| **Google Client ID** | `362498893988-fnrqfrbcb6nbs2j2gvnev10qabc4c2en.apps.googleusercontent.com` | Android Google Login Integration. |
| **Gemini AI Key** | `AIzaSyD15DsOwXALSkp-BtzmphCCSvgCXuHCL_kN` | AI Recommendation system. |
| **Nvidia API Key** | `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` | Advanced LLM task processing. |
| **ZenPay Public Key**| `pk_live_1920b1c7098c2180c706e6fdcbea` | Subscription payments in-app. |

---

## 🛠 III. The Android Stack (Frameworks & Libraries)
To match the Zenify premium feel, use these specific native libraries:

- **UI:** [Jetpack Compose](https://developer.android.com/compose) (Latest stable)
- **Navigation:** [Compose Navigation](https://developer.android.com/jetpack/compose/navigation)
- **Audio Engine:** [Media3 / ExoPlayer](https://developer.android.com/media/media3/exoplayer)
- **Image Loading:** [Coil](https://coil-kt.github.io/coil/)
- **Networking:** [Retrofit 2](https://square.github.io/retrofit/) + [OkHttp 4](https://square.github.io/okhttp/)
- **Local Cache:** [Room Database](https://developer.android.com/training/data-storage/room)
- **State Management:** `ViewModel` + `StateFlow` (Kotlin's reactive state)

---

## 🎨 IV. Global Design System (Design Parity)

### **Colors (Exact Tokens)**
- **Background:** `Color(0xFF0A0A0B)` (Obsidian)
- **Surface:** `Color(0xFF121214)` (Zinc)
- **Accent:** `Color(0xFFE11D48)` (Rose-600)
- **Interactive Layers:** `SurfaceVariant` with 0.7f alpha + `Blur(20.dp)`.

---

## 🏁 V. Page-by-Page Deep Dive (Layout, Text, Logic, Animations)

### **1. Splash & Onboarding**
- **Layout:** Centered logo with hero text.
- **Visuals:** Logo scales from 0.8 to 1.1x using `Spring(dampingRatio = 0.5f)`. Background uses a subtle Pink-to-Black gradient mesh.
- **Text:** "Listen to the Soul." / "Get Started" (Rose pill-button).
- **Logic:** Authenticate session before navigating to Home.

### **2. Authentication (Login/Register)**
- **Layout:** Vertical column with glassmorphic cards and rounded (12dp) input fields.
- **Text:** "Welcome Back to Zenify", "Login", "Sign Up Instead", "Log in with Google".
- **Logic:** POST `/auth/login`. Shake text field on `401 Unauthorized`.

### **3. Home Feed (The Discovery Engine)**
- **Header:** Sticky top bar with logo and profile avatar.
- **Sections:**
    - **Featured Horizon:** Large horizontally scrolling cards for `/homepage/featured`.
    - **Recently Played:** 2x3 grid with small Rose play icons.
    - **AI Curation:** A dynamic row "Made for [User]" utilizing the Gemini API.
- **Animations:** Shared element transitions (Card expansions) when clicking albums.

### **4. Search & Explore**
- **Interaction:** Debounced search calls (300ms delay) to `/search/all?q={query}`.
- **Elements:** Fixed search bar with Rose cursor + category chips like "Chill", "Electronic".
- **Real-time Results:** Sorted by "Tracks", "Artists", "Playlists".

### **5. Full-Screen Player (The Masterpiece)**
- **Background:** Dynamic color extraction using the **Palette API** from the cover art.
- **Visuals:** Huge cover art with a deep `PrimaryAccent` shadow. Large Play/Pause (Animated Icon) button.
- **Advanced Logic:** "StudioFX" Custom 5-band equalizer.
- **Lyrics:** `LazyColumn` for `.lrc` sync. Active line glows White (#FFFFFF), others are 40% opaque.

### **6. Library & Playlists**
- **Layout:** Vertical list of playlists and "Liked Tracks".
- **Logic:** Fetch `/playlists` and `/tracks/liked`. Allow "New Playlist" popup mode.

### **7. Artist & Album Pages**
- **Visuals:** Parallax image header. Floats a large Rose "Play All" button on the divide.
- **Text:** Track count, Duration, Artist bio (expandable).

---

## 📘 VI. The Conversion Handbook (React/Tailwind -> Compose)

| Web Syntax (Tailwind) | Android Syntax (Jetpack Compose) |
| :--- | :--- |
| `flex items-center` | `Row(verticalAlignment = Alignment.CenterVertically)` |
| `grid-cols-2` | `LazyVerticalGrid(columns = GridCells.Fixed(2))` |
| `rounded-2xl` | `shape = RoundedCornerShape(16.dp)` |
| `backdrop-blur-xl` | `Modifier.blur(24.dp)` |
| `Zustand PlayerStore`| `PlayerViewModel` + `StateFlow` |
| `Axios interceptors` | `OkHttpClient.Builder().addInterceptor(...)` |

---

## 🛡 VII. Robustness & Error Handling

1. **Background Stability:** Implement a **Foreground Service** with `MediaSessionService` to keep audio alive.
2. **Offline Mode:** Use **RoomDB** to cache search history and liked track metadata.
3. **API Resilience:** Implement an **Authenticator** that calls `/auth/refresh` when a token expires and silently retries the original request.
4. **Data Grace:** Show Lottie "Retry" animations for network failures. Show "Instrumental" placeholders when lyrics are missing.

---

## 🚀 VIII. Success Metrics for the Builder
- **Performance:** Smooth 60fps scrolling on `LazyColumn`.
- **Aesthetics:** Accurate Rose-600 colors and Black background.
- **Functionality:** Background playback must work with system media controls.

---
**This document is the complete guide for Zenify Android. 
Use it as the 'Prompt Foundation' for your next code generation step.**
