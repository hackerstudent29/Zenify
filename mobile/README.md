# Zenify Android App (via Capacitor)

This folder contains the Capacitor project that wraps the Zenify Next.js frontend into a native **Android** app.

## How it works

1. The Next.js frontend is built as a **static site** (`output: 'export'`) into `frontend/out/`
2. Capacitor copies those static files into `mobile/android/app/src/main/assets/public/`
3. The Android WebView loads the bundled app from there — **no internet needed for the UI**
4. API calls (to your backend) still go over the network as usual

## Prerequisites

- [Android Studio](https://developer.android.com/studio) installed
- Java JDK 17+
- Android SDK (configured via Android Studio)

## Building the Android App

### Step 1: Build & Sync (run from `mobile/` directory)

```powershell
# From the mobile/ directory:
cd ../frontend
Rename-Item -LiteralPath middleware.ts -NewName middleware.ts.bak -Force
npx next build
Rename-Item -LiteralPath middleware.ts.bak -NewName middleware.ts -Force
cd ../mobile
npx cap sync android
```

### Step 2: Open in Android Studio

```powershell
npx cap open android
```

Android Studio will open with the project. You can:
- Run it on an emulator (Ctrl+R)
- Build a signed APK (Build > Generate Signed Bundle/APK)

## Project Structure

```
mobile/
├── android/          <- Native Android project (open in Android Studio)
├── capacitor.config.json  <- Capacitor config (app ID, web assets dir)
├── package.json      <- Scripts shortcut
└── README.md         <- This file
```

## Backend URL Configuration

The app communicates with your backend. Make sure your `frontend/.env` file 
has the **public** backend URL (not `localhost`) when building for Android.

For local testing on a physical device, use your machine's local IP address, e.g.:
```
NEXT_PUBLIC_API_URL=http://192.168.1.100:4000/api
```

## Important Notes

- The `frontend/middleware.ts` must be temporarily renamed during build (static export doesn't support Next.js middleware)
- Dynamic route pages (`album/[...id]`, `playlist/[...id]`, `explore/[...id]`) use catch-all segments for compatibility
- Audio streaming still goes through your backend API — songs are not stored offline on-device (that would require extra Capacitor plugins)
