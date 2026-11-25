# Zenify Release Checklist Skill (`zenify-release`)

A reusable workflow skill for shipping new Zenify Android & Backend releases without missing version bumps, OTA update notices, `.gitignore` APK whitelists, release notes, or GitHub Release tags.

## What This Skill Automates & Enforces

- Consistent semver and build-code bumping across Flutter (`mobile/pubspec.yaml`), Node manifests (`backend/package.json`, `frontend/package.json`), SVG badges, and docs
- Verification gates (`flutter analyze`, `flutter test`, `tsc --noEmit`) before packing binaries
- Clean ARM64 split + Universal APK builds (`--split-per-abi` and universal release) with verified byte-size reporting
- Synchronized OTA update notice payloads in `frontend/public/remote_config.json` and `backend/src/index.ts`
- `.gitignore` whitelisting and APK placement in `frontend/public/downloads/` and `backend/public/downloads/` so `.github/workflows/release.yml` automatically creates the GitHub Release when `vX.Y.Z` is pushed

## Usage

Invoke `/zenify-release` or ask the agent to prepare and push a new version (for example: *"Bump Zenify to 1.1.23, pack APKs, update docs, and push"*).
