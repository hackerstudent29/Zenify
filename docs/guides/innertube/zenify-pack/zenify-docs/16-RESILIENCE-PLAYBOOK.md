# 16. Resilience Playbook: "rarely blocked, quickly fixed"

There is no guaranteed way to avoid blocks from YouTube. The goal is a system that (1) sends as little traffic as possible from each phone, (2) backs off instead of hammering, (3) degrades gracefully, and (4) can be repaired and shipped to every friend within hours. This doc is the contract for the agent.

## Hard boundaries for the agent

- All YouTube Music metadata traffic goes through `InnerTubeTransport` (Dart). No other code calls YouTube domains directly.
- All stream resolution goes through the native `StreamSource` interface (see `06`). No Dart code builds or proxies stream URLs for YouTube tracks.
- **Do not hand-write cipher solving, JavaScript deobfuscation, or attestation/PoToken generation.** Use a maintained open-source extractor library behind `StreamSource` (task P10-09 chooses it). If you find yourself writing code that decodes obfuscated player JS or generates attestation tokens, stop and use the library's documented mechanism instead.
- Never retry on HTTP 403. Never bypass or reset the circuit breaker except on a successful request. Never exceed the clamps in remote config.
- Never put signed stream URLs, cookies or tokens into logs, diagnostics exports or failure reports.

## Architecture

```
Dart                                              Native (Kotlin)
────                                              ───────────────
RemoteConfigService ──(setResolverConfig)───────► ResolverPolicy (breaker, concurrency)
InnerTubeTransport (pace, backoff, breaker,       ZenifyExoPlayerManager
  cache, dedupe, stale-if-error)                    └─ ResolvingDataSource ("zenify-yt://<id>")
ApiService / ArtistService / screens                    └─ UrlCache (expiry-aware, single-flight)
FailureReporter (opt-in) ◄──(error events)──────────────└─ StreamSource
UpdateBanner (min/latest version)                              └─ ExtractorStreamSource (maintained library)
```

Reference Dart implementations of the transport and services are in `reference/services/`. Use them as the starting point (task P10-01).

## 1. Device-first, everywhere

- Set `ZENIFY_STREAM_MODE=device` as the default (remote config can flip it).
- `ApiService.resolveStreamUrl` returns `zenify-yt://<videoId>` for YouTube tracks in device mode; the native `ResolvingDataSource` turns it into a real URL on the phone.
- The cloud backend keeps lyrics, Blend and Together only. It must not touch YouTube.
- Cloud search fallback stays behind a flag and never runs when the failure was rate limiting.

## 2. Native resolver requirements (`ExtractorStreamSource`)

1. Adapter around the chosen library implementing `StreamSource.resolve(trackId, quality)`.
2. Provide whatever HTTP interface the library requires (for NewPipeExtractor-style libraries that is a Downloader implemented over OkHttp). Read the library's README; do not guess.
3. `UrlCache`: key `videoId+quality`, honor the expiry the library reports; if none, use a conservative 30 minutes minus a safety margin from config (`urlSafetyMarginSec`).
4. Single-flight: concurrent requests for the same id share one resolve.
5. Concurrency limit (config `maxConcurrentResolves`, default 2) and jitter (100-400 ms) between pre-resolves.
6. Mid-stream 403/410: re-resolve once and resume at the current position; if it fails again surface `RESOLVE_FAILED`.
7. Native circuit breaker with the same shape as the Dart one; parameters come from remote config via `setResolverConfig`.
8. Record the library name and version; expose in Diagnostics and in failure reports.

### Error taxonomy (native → Dart event `error.code`)

| Code | Meaning | Dart behavior |
|---|---|---|
| `RATE_LIMITED` | 429 or breaker open | Show cool-down banner with remaining time; no retries; keep playing cached/downloaded audio |
| `BOT_CHECK` | Block / challenge page / 403 | Same as above, plus report; do not retry |
| `UNAVAILABLE` | Region/age/removed | Skip to next track, toast once |
| `EXTRACTOR_BROKEN` | Parse failure from the library | Report; show "Playback is temporarily unavailable, an update is coming" if update available |
| `NETWORK` | Offline/timeouts | Standard retry once, offline banner |

## 3. Remote config (change behavior without a new APK)

- Hosted as a static JSON file over HTTPS (GitHub raw or Pages). URL via `--dart-define=ZENIFY_CONFIG_URL=...`.
- `RemoteConfigService` (starter in `starter/lib/remote_config_service.dart`): loads cached copy at startup, refreshes in the background (never blocks startup), uses ETag, 5 s timeout, refreshes on app resume at most every 6 hours.
- Safety: every numeric value is clamped to a safe range; unknown keys ignored; version must be >= current (no rollback from stale CDN); config contains data only, never code.
- Keys (see `starter/remote_config.sample.json`): `version`, `streamMode`, `resolver.*`, `innertube.*` (bucket, attempts, breaker, optional `clientVersion` override), `cacheTtlSec.*`, `killSwitches.*`, `minAppVersion`, `latestAppVersion`, `updateUrl`, `message`.
- Kill switches (all default false): `cloudFallback`, `remoteSuggestions`, `charts`, `newReleases`, `preResolve`, `homeFeed`. A killed feature returns cached data or an empty state, never an error dialog.
- `InnerTubeTransport`, `ApiService` and the native `ResolverPolicy` read their tunables from the current config instead of constants.

## 4. Shipping fixes fast

- **Same signing key forever.** Android refuses to update an app signed with a different key. Create one release keystore, store it safely (not in the repo), and sign every build with it. Do not ship debug-signed builds to friends.
- Publish APKs on GitHub Releases; friends install via an auto-updating installer such as Obtainium (point it at the releases page), or the in-app banner opens the release URL.
- In-app `UpdateBanner`: if `appVersion < minAppVersion` show a blocking-but-dismissible sheet; if `< latestAppVersion` show a soft banner. Version compare is semantic (`2.10.0 > 2.9.3`).
- Keep the release process to one command or one CI workflow: build, sign, upload, bump `latestAppVersion` in the config.

## 5. Cut resolves and requests

- Pre-resolve the next 1-2 queue items at 30% progress (config `preResolveCount`, killable).
- Keep the disk audio cache and downloads; replay and offline never resolve.
- Dart transport TTLs as in `reference/services/innertube_service.dart`; TTLs overridable by `cacheTtlSec`.
- Debounce search at 300 ms, only submit queries of 2+ chars, cancel stale requests.
- Do not warm anything except the home feed at startup.

## 6. Failure reporting (opt-in)

- Settings toggle "Share anonymous playback errors", off by default.
- Event: `{ts, layer: "dart|native", code, httpStatus?, appVersion, resolverLib, resolverVersion, androidSdk, configVersion, breakerState}`.
- Never include track ids, titles, URLs, IPs, cookies, tokens.
- Max 1 report/minute/device, batched, sent to a tiny endpoint on the cloud backend (`POST /api/diag`) that only stores aggregates.
- The Diagnostics page can export the same data to a local file for manual sharing.

## 7. Optional signed-in mode (defer)

Do not implement until P10-01..P10-18 are done and the user asks. If implemented: off by default, throwaway account only (warn clearly in UI), credentials/cookies in `flutter_secure_storage`, never logged, easy "sign out and wipe". Record the decision in `DECISIONS_LOG.md`.

## 8. Runbook: when playback breaks

1. Open Diagnostics → export. Note the error code and resolver library version.
2. `RATE_LIMITED`/`BOT_CHECK` on one device: wait for the cool-down, confirm it clears. On many devices at once: flip kill switches (`preResolve`, `charts`, `newReleases`) in remote config and set `message`.
3. `EXTRACTOR_BROKEN` on many devices: check the extractor library's issues and releases; bump the pinned version; build, sign, release; update `latestAppVersion` (and `minAppVersion` if the old build is useless).
4. Verify on a real device with the new build before announcing.
5. Write a line in `DECISIONS_LOG.md` (date, symptom, fix).

## 9. Test plan

- Unit (Dart, fake `http.Client`): breaker trips after repeated failures and recovers on success; 403 never retries; `Retry-After` honored; stale-if-error serves old data; identical concurrent requests produce one HTTP call; token bucket spaces requests.
- Unit: `RemoteConfig.fromJson` clamps hostile values; rollback ignored; version compare.
- Unit (Kotlin, fake resolver): single-flight, concurrency limit, expiry handling, re-resolve once on 403, breaker open → error without calling the library.
- Drill: with a config flip simulate "extractor broken" and confirm banner, fallbacks, and that downloaded/cached tracks still play.
- Soak: 2 hours of continuous queue play with screen off on a real device; zero crashes, resolves per track ≤ 1, no resolve for cached tracks.

## Acceptance criteria

- Zero direct YouTube calls outside the transport and `StreamSource`.
- 100 plays of 20 distinct tracks produce ≤ 20 resolves plus ≤ 20 pre-resolves.
- Cool-down state visible in UI and Diagnostics, and clears on its own.
- A config-only change (kill switch) takes effect on a device within one app resume.
- A signed update installs over the previous build on a test phone without uninstalling.
