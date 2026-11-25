# Zenify Release Files & Artifacts Map

## 1. Version & Build Number Locations

| File | Fields to Update | Notes |
|---|---|---|
| `mobile/pubspec.yaml` | `version: X.Y.Z+BUILD` | Source of truth for Android `versionName` and `versionCode` |
| `frontend/public/remote_config.json` | `version`, `latestAppVersion`, `releaseDate`, `releaseTime`, `updateUrl`, `features`, `fixes`, `improvements`, `releaseNotes`, `message` | Primary GitHub raw OTA feed checked by `UpdateService` |
| `backend/src/index.ts` | `defaultRemoteConfig` (`latestAppVersion`, `releaseDate`, `releaseTime`, `updateUrl`, `features`, `fixes`, `improvements`, `releaseNotes`, `message`) + `filename="zenify-vX.Y.Z.apk"` | Backend `/remote_config.json`, `/api/config`, `/download/app`, `/api/download/app` |
| `backend/package.json` | `"version": "X.Y.Z"` | Backend package version |
| `frontend/package.json` | `"version": "X.Y.Z"` | Frontend package version |
| `assets/badges/badge_release.svg` | `<text ...>vX.Y.Z · ...</text>` | README header release capsule |
| `frontend/src/app/download/page.tsx` | `githubReleaseUrl`, `directApkDownloadUrl`, `universalApkDownloadUrl`, SEO `title`/`description`/`softwareVersion`, badge, specs & size labels | Download page metadata |
| `frontend/src/components/shared/AppMigrationNotice.tsx` | `directApkUrl`, `Download vX.Y.Z APK` | Migration card APK CTA |
| `README.md` | CTA buttons, badge alt, comparison table header, specifications table (`Release Milestone`, `Build Number`, APK sizes), release packages table, installation instructions | Main repository landing page |
| `mobile/README.md` | `Version`, `ARM64 Split APK`, `Universal APK` | Mobile directory specs |
| `mobile/ZENIFY_ANDROID_APP.md` | `Current Version`, `Build Number`, APK sizes | Technical specification doc |
| `CHANGELOG.md` | Prepend `## [X.Y.Z] - YYYY-MM-DD` | Release history |
| `docs/releases/RELEASE_NOTES_vX.Y.Z.md` | New file matching prior release notes structure | Detailed release notes |

## 2. APK Packaging & `.gitignore` Rules

Root `.gitignore` ignores `*.apk` and `frontend/public/downloads/*` by default. Every versioned APK must be whitelisted explicitly in `.gitignore` under both sections:

```gitignore
!frontend/public/downloads/zenify-vX.Y.Z.apk
!frontend/public/downloads/zenify-vX.Y.Z-universal.apk
```

### Destination Mapping

- `mobile/build/app/outputs/flutter-apk/app-arm64-v8a-release.apk` →
  - `frontend/public/downloads/zenify-vX.Y.Z.apk`
  - `frontend/public/downloads/zenify.apk`
- `mobile/build/app/outputs/flutter-apk/app-release.apk` →
  - `frontend/public/downloads/zenify-vX.Y.Z-universal.apk`
  - `frontend/public/downloads/zenify-universal.apk`
  - `backend/public/downloads/zenify-universal.apk`

## 3. GitHub Actions Release Trigger (`.github/workflows/release.yml`)

Pushing any tag matching `v*` (for example `git push origin v1.1.22`) triggers `.github/workflows/release.yml`, which:
1. Creates GitHub Release `vX.Y.Z` if it does not already exist.
2. Uses pre-built `frontend/public/downloads/zenify.apk` and `backend/public/downloads/zenify-universal.apk` if present, uploading:
   - `zenify-vX.Y.Z.apk`
   - `zenify.apk`
   - `zenify-vX.Y.Z-universal.apk`
   - `zenify-universal.apk`
3. Otherwise falls back to rebuilding APKs in CI (`flutter build apk --split-per-abi` and `flutter build apk`) and uploading all 4 assets.
