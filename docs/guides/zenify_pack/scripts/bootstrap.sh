#!/usr/bin/env bash
# Template, review before running. Run from the empty repo root containing this pack.
set -euo pipefail
flutter create --org com.zenify --project-name zenify --platforms android .
mkdir -p assets/{mock,fonts,ir,rive,images}
cp -n starter/analysis_options.yaml ./analysis_options.yaml
cp -n starter/assets/mock/*.json assets/mock/ || true
echo "Now merge starter/pubspec.yaml dependencies into pubspec.yaml, then:"
echo "  flutter pub get && dart run build_runner build --delete-conflicting-outputs"
