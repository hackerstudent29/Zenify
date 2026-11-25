---
name: zenify-release
description: "This skill should be used when the user asks to bump the Zenify app version, pack release APKs, broadcast an OTA update notice, update README/CHANGELOG/release notes, create a version tag, or ship a new Zenify release."
category: release-engineering
risk: safe
tags: "[release, versioning, apk, flutter, github-releases, checklist]"
date_added: "2026-11-25"
---

# Zenify Version Release & APK Packaging Checklist

## Purpose

Standardize every Zenify release end-to-end so version numbers, build codes, in-app OTA notices, documentation, compressed ARM64/Universal APKs, Git tags, and GitHub Releases stay synchronized with zero missed files.

## When to Use This Skill

Use this skill whenever the user asks to:
- Bump Zenify to a new version (e.g., `1.1.22`)
- Pack and publish release APKs
- Update `README.md`, `CHANGELOG.md`, `remote_config.json`, or release notes
- Broadcast an in-app update notice and push a tagged release to GitHub

---

## Mandatory Release Checklist

Execute steps in exact order. Read `references/release-files-map.md` when checking exact file locations and rules.

### Phase 1: Inspect Current Version & Real Changes
1. Read `mobile/pubspec.yaml` (`version: X.Y.Z+BUILD`) to confirm the previous version and integer build number.
2. Increment build number by `+1` for the new release (`NEW_BUILD = OLD_BUILD + 1`).
3. Collect verified changes since the previous release tag:
   ```powershell
   git log --oneline -n 25
   git status -s
   ```
4. Group real, verified changes into **What's New / Features**, **Improvements**, and **Fixes**. Never fabricate changes or copy placeholder text.

### Phase 2: Pre-Build Code & Analysis Verification
1. Clear Windows asset lock before running Flutter checks:
   ```powershell
   Set-Location mobile
   Remove-Item -Force -ErrorAction SilentlyContinue build\unit_test_assets\NativeAssetsManifest.json
   flutter analyze --no-pub
   flutter test --no-pub
   ```
2. Run TypeScript checks in `backend/` and `frontend/`:
   ```powershell
   npx tsc --noEmit
   ```
3. Remove any temporary test artifacts created in the working tree (such as `mobile/all_time_index.json` if generated during tests).

### Phase 3: Bump Version Across Code, Configs & `.gitignore`
Update `X.Y.Z` and `NEW_BUILD` in every required file:
1. `mobile/pubspec.yaml` → `version: X.Y.Z+NEW_BUILD`
2. `backend/package.json` → `"version": "X.Y.Z"`
3. `frontend/package.json` → `"version": "X.Y.Z"`
4. `assets/badges/badge_release.svg` → update badge label (`vX.Y.Z · Release`)
5. `.gitignore` → whitelist both new APKs under BOTH `*.apk` and `frontend/public/downloads/*`:
   - `!frontend/public/downloads/zenify-vX.Y.Z.apk`
   - `!frontend/public/downloads/zenify-vX.Y.Z-universal.apk`
6. `frontend/src/app/download/page.tsx` & `frontend/src/components/shared/AppMigrationNotice.tsx` → update release links, SEO metadata, `softwareVersion`, build number, and APK filenames.

### Phase 4: Build & Pack Release APKs (ARM64 + Universal)
Build both release packages in `mobile/` after `pubspec.yaml` is updated so the compiled binaries embed the new `versionName` and `versionCode`:
```powershell
Set-Location mobile
Remove-Item -Force -ErrorAction SilentlyContinue build\unit_test_assets\NativeAssetsManifest.json
flutter build apk --release --split-per-abi
flutter build apk --release
```
1. Inspect exact byte sizes and compute 1-decimal MiB sizes (`[math]::Round($bytes / 1MB, 1)`):
   - ARM64 split: `mobile/build/app/outputs/flutter-apk/app-arm64-v8a-release.apk`
   - Universal: `mobile/build/app/outputs/flutter-apk/app-release.apk`
2. Copy built APKs into tracked release download folders (used by `.github/workflows/release.yml`):
   - ARM64 →
     - `frontend/public/downloads/zenify-vX.Y.Z.apk`
     - `frontend/public/downloads/zenify.apk`
     - `backend/public/downloads/zenify.apk` (if tracked)
   - Universal →
     - `frontend/public/downloads/zenify-vX.Y.Z-universal.apk`
     - `frontend/public/downloads/zenify-universal.apk`
     - `backend/public/downloads/zenify-universal.apk`

### Phase 5: Broadcast OTA Notice & Update Documentation
Use ONLY the exact measured APK sizes from Phase 4:
1. **`frontend/public/remote_config.json`** (primary GitHub raw OTA feed fetched by `UpdateService`):
   - Set `"version": NEW_BUILD`
   - Set `"latestAppVersion": "X.Y.Z"`
   - Set `"releaseDate"` and `"releaseTime"` (IST)
   - Set `"updateUrl": "https://github.com/hackerstudent29/Zenify/releases/download/vX.Y.Z/zenify-vX.Y.Z.apk"`
   - Populate `"features"`, `"fixes"`, `"improvements"`, `"releaseNotes"`, and `"message"`.
2. **`backend/src/index.ts`** (`defaultRemoteConfig` + download endpoints):
   - Sync `latestAppVersion`, `releaseDate`, `releaseTime`, `updateUrl`, `features`, `fixes`, `improvements`, `releaseNotes`, `message`.
   - Update `Content-Disposition` filename in `/download/app` and `/api/download/app` to `zenify-vX.Y.Z.apk`.
3. **`CHANGELOG.md`**:
   - Prepend `## [X.Y.Z] - YYYY-MM-DD` section detailing Features, Improvements, and Fixes.
4. **`docs/releases/RELEASE_NOTES_vX.Y.Z.md`**:
   - Create complete release notes with build number, date, exact package sizes, highlights, and GitHub Release links.
5. **README & Mobile Specs**:
   - Update `README.md` (CTA release links, badge alt text, comparison header, spec table version/build/APK byte sizes, download table, setup APK path).
   - Update `mobile/README.md` (`Version`, `ARM64 Split APK`, `Universal APK` sizes).
   - Update `mobile/ZENIFY_ANDROID_APP.md` (`Current Version`, `Build Number`, APK sizes).
   - Update size labels in `frontend/src/app/download/page.tsx` if changed.

### Phase 6: Security Scan, Tag & Push
1. Run `node scripts/secret-scan.js` (if present) and verify `git status` shows NO `.env`, keystore, `.db`, or temporary scratch files.
2. Re-run `flutter analyze --no-pub` and `npx tsc --noEmit` in `backend/` if `.dart` / `.ts` files changed after Phase 2.
3. Stage intended release files explicitly (or verify `git status` before `git add`) and commit:
   ```powershell
   git commit -m "release(vX.Y.Z): <concise summary of release>"
   ```
4. Tag and push branch + tag to `origin` so `.github/workflows/release.yml` creates the GitHub Release and uploads all 4 APK assets automatically:
   ```powershell
   git tag -a vX.Y.Z -m "Zenify vX.Y.Z"
   git push origin main
   git push origin vX.Y.Z
   ```
5. Report exact release version, build number, measured APK sizes, commit hash, tag, and GitHub Actions workflow trigger status.
