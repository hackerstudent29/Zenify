# 12. Catalog, Lyrics and Mock Data Contracts

The app never talks to a provider directly from UI or BLoCs. It talks to these interfaces. Implement `Mock*` first so every screen is buildable and testable without network.

## Interfaces (Dart, `domain/repositories`)

```dart
abstract class CatalogSource {
  Future<HomeFeed> home();
  Future<SearchResults> search(String q, {SearchType type = SearchType.all, int page = 0});
  Future<List<String>> suggest(String q);
  Future<ArtistDetail> artist(String id);
  Future<AlbumDetail> album(String id);
  Future<PlaylistDetail> playlist(String id);
  Future<Page<MediaItem>> section(String type, {int page = 0, SortBy sort = SortBy.popularity});
  Future<List<Track>> dayMix(DaySlot slot);
  Future<List<Track>> similar(String trackId);        // radio / autoplay
  Future<List<Category>> categories();                // browse grid + moods
}

abstract class LyricsSource {
  Future<Lyrics?> fetch({required String title, required String artist, Duration? duration});
}

abstract class StreamSource {            // Kotlin side, see 06
  suspend fun resolve(trackId: String, quality: Quality): ResolvedStream
}
```
Implementations: `MockCatalogSource` (asset JSON, deterministic), `RemoteCatalogSource` (your chosen provider/API). Switch with `--dart-define=CATALOG=mock|remote`.

## JSON shapes (mock files and remote mappers must produce these)

```json
// Track
{ "id":"t1","title":"Midnight Drive","artists":[{"id":"a1","name":"Nova Lane"}],
  "album":{"id":"al1","title":"City Lights"},"durationMs":214000,"artUrl":null,
  "explicit":false,"playCount":1200345,"genres":["Indie"],"year":2024 }
// Album
{ "id":"al1","title":"City Lights","artist":{"id":"a1","name":"Nova Lane"},"year":2024,
  "genre":"Indie","label":"Zenify Test Records","copyright":"© 2024 Test","tracks":[<Track>],"artUrl":null }
// Artist
{ "id":"a1","name":"Nova Lane","verified":true,"monthlyListeners":482113,"bio":"…",
  "imageUrl":null,"topTracks":[<Track>],"albums":[<Album>],"singles":[<Album>],
  "appearsOn":[<Album>],"similar":[{"id":"a2","name":"Kiran"}] }
// Playlist
{ "id":"p1","title":"Late Night","creator":{"id":"u1","name":"You"},"isPublic":false,"tracks":[<Track>] }
// HomeFeed
{ "hero":[<MediaItem>],"quickPicks":[<Track>],"mixes":[<Playlist>],"trending":[<MediaItem>],
  "topArtists":[<Artist>],"recent":[<MediaItem>] }
// Page
{ "items":[…], "nextPage":1|null }
```
`MediaItem` = `{type:"track|album|artist|playlist", id, title, subtitle, artUrl}`.

Placeholder art: when `artUrl` is null, render a deterministic gradient from `hash(id)` with the title initial. Never block the UI on image loading.

## Lyrics

LRC format for synced lyrics:
```
[ar:Nova Lane]
[ti:Midnight Drive]
[00:12.40]First line here
[00:16.85]Second line here
```
Enhanced (word-level) lines: `[00:12.40]<00:12.40>First <00:12.90>line <00:13.30>here`.

Parser rules: ignore unknown tags; sort by timestamp; support multiple timestamps per line; `offset` stored per track (user stepper in 0.1 s steps, persisted). Fallback to plain text when no timestamps. Romanization: `romanized["tanglish"|"hinglish"]` filled by a transliteration step (library or provider field); the pill switch hides when unavailable.

Candidate lyric sources to evaluate (verify terms and availability yourself): LRCLIB (open synced-lyrics API), your catalog provider's lyrics endpoint, or local `.lrc` files next to device audio. Cache every fetch in Drift.

## Local audio mapping (Device Library)

MediaStore row → `Track{ id:"local:<mediaId>", source:local, localUri:content://… }`. Tags via MediaStore columns first; embedded cover via `MediaMetadataRetriever` on a background isolate, cached on disk.

## Day Mix slots

`DaySlot` by local hour: morning 5-11, afternoon 11-17, sunset 17-21, night 21-1, midnight 1-5. Mock: pick tracks by tag `slot`. Remote: seed by time-of-day genres plus user history.

## Mock data requirements

`assets/mock/catalog.json` must contain at least: 3 artists, 3 albums (8 tracks each when expanded), 1 playlist, 6 categories, 6 moods, home feed sections, and one track with long title and non-Latin text (Tamil/Hindi) to test fonts and marquee. A sample is in `starter/assets/mock/catalog.json`; extend it. For audio during UI work, mock tracks may point to a short local test file (`assets/mock/test_tone.mp3`, add your own).
