# 08. Backend: Together and Blend

Only Together, Blend and account/profile need a server. Suggested stack: Spring Boot (STOMP over WebSocket) + PostgreSQL + Redis (room state, pub/sub). Any stack works if it keeps the protocol below. For local testing, run it with Docker Compose on your PC and point the app at your LAN IP.

## REST endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/guest`, `/auth/login` | Returns JWT |
| GET/PUT | `/me` | Profile |
| POST | `/rooms` | Create room `{mode: "dj"|"collab"}` → `{code}` (6 chars, A-Z0-9 without ambiguous chars) |
| GET | `/rooms/:code` | Room snapshot |
| GET | `/time` | `{serverNowMs}` for clock sync |
| POST | `/blends` | Create → `{id, inviteCode}` |
| POST | `/blends/join` | `{code}` → blend |
| GET | `/blends`, `/blends/:id` | List, detail (score, tracks, nextRefreshAt) |
| POST | `/me/listening` | Batch upload of recent plays (for taste profile) |

## Together: WebSocket (STOMP)

Connect `wss://host/ws` with `Authorization: Bearer <jwt>`.

| Direction | Destination | Payload |
|---|---|---|
| client → | `/app/room/{code}/join` | `{}` |
| client → | `/app/room/{code}/control` | `{action: "play"|"pause"|"seek"|"next"|"prev", positionMs?}` (DJ, or anyone in collab) |
| client → | `/app/room/{code}/queue` | `{op: "add"|"remove"|"move", track?, index?, to?}` |
| client → | `/app/room/{code}/chat` | `{text}` |
| client → | `/app/room/{code}/react` | `{emoji}` |
| client → | `/app/room/{code}/ping` | `{t0}` |
| ← server | `/topic/room/{code}/state` | `{trackId, queue[], playing, positionMs, atServerMs, version}` |
| ← server | `/topic/room/{code}/presence` | `{listeners[{id,name,avatar,isDj}]}` |
| ← server | `/topic/room/{code}/chat` | `{from, text, atServerMs}` |
| ← server | `/topic/room/{code}/react` | `{from, emoji, seed}` (seed makes bubble path identical everywhere) |
| ← server (user) | `/user/queue/pong` | `{t0, t1, t2}` |

State is authoritative on the server and versioned; clients ignore stale versions. Reconnect with exponential backoff, then request a fresh snapshot.

## Clock sync

Client sends ping with `t0` (client send time). Server replies `t1` (receive) and `t2` (send). Client records `t3` (receive).

```
rtt    = (t3 − t0) − (t2 − t1)
offset = ((t1 − t0) + (t2 − t3)) / 2      // server − client
```

Take 8 samples at room join, keep the 3 with lowest RTT, use their median offset. Refresh every 30 s. Expected accuracy ±30-80 ms on mobile networks.

## Playback sync

Server state gives `positionMs` valid at `atServerMs`. Client computes:

```
serverNow = clientNow + offset
target    = positionMs + (serverNow − atServerMs)   // while playing
drift     = playerPosition − target
```

| |drift| | Action |
|---|---|
| < 25 ms | none |
| 25-300 ms | nudge speed to 1 ± 0.02 (slower if ahead, faster if behind) until < 10 ms |
| > 300 ms | `seekTo(target)` |

Track changes: clients start resolving the next track as soon as the queue event arrives; playback starts at `startAtServerMs` sent by the server (≈ now + 1.5 s) so all devices begin together. Re-sync every 5 s from a state heartbeat.

## Room rules

- DJ mode: only host can control playback and reorder; others can chat, react, suggest.
- Collab mode: all can queue/reorder; only host can skip/seek (configurable).
- Host leaves: transfer DJ to longest-connected listener. Empty room expires after 10 min.
- Rate limits: chat 1 msg/s, reactions 5/s.

## Blend

Taste profile per user (rebuilt from `/me/listening`, last 90 days): weighted artist counts, genre counts, track counts.

```
artistOverlap = Σ min(wA,wB) / Σ max(wA,wB)         // weighted Jaccard
genreCosine   = cos(genreVecA, genreVecB)
trackOverlap  = |A∩B| / |A∪B|
score = round(100 · (0.5·artistOverlap + 0.3·genreCosine + 0.2·trackOverlap))
```

Archetype label from top shared genre + score band (e.g., "Late-night Kollywood twins").

Shared playlist (50 songs): ~40% overlapping favorites, ~30% A's top not in B, ~30% B's top not in A; interleave; tag each with `origin: you|friend|both`. Rebuilt by a daily job at the blend's `nextRefreshAt` (24 h after the last).

## Schema (PostgreSQL)

```sql
users(id uuid pk, name, avatar_url, created_at)
listening_events(user_id, track_id, artist_ids text[], genres text[], played_at)
rooms(code pk, host_id, mode, created_at, closed_at)
blends(id uuid pk, user_a, user_b, score int, archetype, next_refresh_at, invite_code unique)
blend_tracks(blend_id, position int, track_id, origin)
recent_rooms(user_id, code, joined_at)
```

## Security (even for testing)

JWT with short expiry, validate room membership on every STOMP message, cap payload sizes, never trust client `positionMs` unless sender is authorized to control.
