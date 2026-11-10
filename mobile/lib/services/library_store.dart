import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../data/datasources/catalog_datasource.dart';
import '../models/track.dart';

/* ------------------------------------------------------------------ */
/*  Storage                                                             */
/* ------------------------------------------------------------------ */

abstract class LibraryStorage {
  Future<String?> read();
  Future<void> write(String json);
}

class MemoryLibraryStorage implements LibraryStorage {
  String? _v;
  @override
  Future<String?> read() async => _v;
  @override
  Future<void> write(String json) async => _v = json;
}

class PrefsLibraryStorage implements LibraryStorage {
  static const _keyPrimary = 'library_v1';
  static const _keyBackup = 'library_v1_backup';

  @override
  Future<String?> read() async {
    try {
      final p = await SharedPreferences.getInstance();
      await p.reload();
      final val = p.getString(_keyPrimary);
      if (val != null && val.trim().isNotEmpty && val.trim().length > 10) return val;
      final backup = p.getString(_keyBackup);
      if (backup != null && backup.trim().isNotEmpty && backup.trim().length > 10) return backup;
      return null;
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> write(String json) async {
    try {
      final p = await SharedPreferences.getInstance();
      await p.setString(_keyPrimary, json);
      if (json.trim().length > 20) {
        await p.setString(_keyBackup, json);
      }
    } catch (_) {}
  }
}

/* ------------------------------------------------------------------ */
/*  Models                                                              */
/* ------------------------------------------------------------------ */

class FollowedArtist {
  const FollowedArtist(this.name, this.cover);
  final String name, cover;
}

class SavedAlbum {
  const SavedAlbum(this.title, this.artist, this.cover);
  final String title, artist, cover;
}

class UserPlaylist {
  UserPlaylist({required this.id, required this.name, List<String>? trackIds})
      : trackIds = trackIds ?? [];
  final String id;
  String name;
  final List<String> trackIds;
}

class ArtistInfo {
  ArtistInfo(this.name, this.cover, this.count);
  final String name, cover;
  int count;
}

class AlbumInfo {
  AlbumInfo(this.title, this.artist, this.cover, this.count);
  final String title, artist, cover;
  int count;
}

/* ------------------------------------------------------------------ */
/*  Catalog helpers                                                     */
/* ------------------------------------------------------------------ */

List<ArtistInfo> catalogArtists() {
  final m = <String, ArtistInfo>{};
  for (final t in CatalogDataSource.allTracks) {
    if (t.artist.trim().isEmpty) continue;
    final e = m[t.artist];
    if (e == null) {
      m[t.artist] = ArtistInfo(t.artist, t.coverUrl, 1);
    } else {
      e.count++;
    }
  }
  return m.values.toList()..sort((a, b) => b.count.compareTo(a.count));
}

List<AlbumInfo> catalogAlbums() {
  final m = <String, AlbumInfo>{};
  for (final t in CatalogDataSource.allTracks) {
    final a = t.album;
    final title = a.isEmpty ? t.title : a;
    if (title.trim().isEmpty) continue;
    final key = '$title|${t.artist}';
    final e = m[key];
    if (e == null) {
      m[key] = AlbumInfo(title, t.artist, t.coverUrl, 1);
    } else {
      e.count++;
    }
  }
  return m.values.toList()..sort((a, b) => b.count.compareTo(a.count));
}

/* ------------------------------------------------------------------ */
/*  Store                                                               */
/* ------------------------------------------------------------------ */

/// The user's library: liked songs, followed artists, saved albums, playlists.
/// Preserves full track metadata across app launches and network restarts.
class LibraryStore extends ChangeNotifier {
  LibraryStore._() {
    unawaited(ensureLoaded());
  }
  static final LibraryStore instance = LibraryStore._();
  static LibraryStorage storage = PrefsLibraryStorage();

  final Map<String, Track> _seen = {};
  final List<String> _liked = [];
  final List<FollowedArtist> _artists = [];
  final List<SavedAlbum> _albums = [];
  final List<UserPlaylist> _playlists = [];
  Future<void>? _loading;
  bool _isLoaded = false;

  bool get isLoaded => _isLoaded;

  Future<void> ensureLoaded() async {
    if (_isLoaded) return;
    _loading ??= _load();
    await _loading;
  }

  Future<void> _load() async {
    try {
      final raw = await storage.read();
      if (raw != null && raw.isNotEmpty) {
        final j = jsonDecode(raw);
        if (j is Map<String, dynamic>) {
          // 1. Restore tracks cache first so IDs can resolve immediately
          final rawTracks = j['tracks'];
          if (rawTracks is Map) {
            for (final entry in rawTracks.entries) {
              try {
                if (entry.value is Map) {
                  final map = Map<String, dynamic>.from(entry.value as Map);
                  _seen['${entry.key}'] = Track.fromJson(map);
                }
              } catch (_) {}
            }
          }

          // 2. Liked songs
          if (j['liked'] is List) {
            _liked.clear();
            for (final id in (j['liked'] as List)) {
              if (id != null && '$id'.trim().isNotEmpty) {
                _liked.add('$id'.trim());
              }
            }
          }

          // 3. Followed artists
          if (j['artists'] is List) {
            _artists.clear();
            for (final item in (j['artists'] as List)) {
              if (item is Map) {
                final name = (item['name'] as String? ?? '').trim();
                final cover = (item['cover'] as String? ?? '').trim();
                if (name.isNotEmpty) {
                  _artists.add(FollowedArtist(name, cover));
                }
              }
            }
          }

          // 4. Saved albums
          if (j['albums'] is List) {
            _albums.clear();
            for (final item in (j['albums'] as List)) {
              if (item is Map) {
                final title = (item['title'] as String? ?? '').trim();
                final artist = (item['artist'] as String? ?? '').trim();
                final cover = (item['cover'] as String? ?? '').trim();
                if (title.isNotEmpty) {
                  _albums.add(SavedAlbum(title, artist, cover));
                }
              }
            }
          }

          // 5. User playlists
          if (j['playlists'] is List) {
            _playlists.clear();
            for (final item in (j['playlists'] as List)) {
              if (item is Map) {
                final id = (item['id'] as String? ?? '').trim();
                final name = (item['name'] as String? ?? '').trim();
                final rawList = item['tracks'] as List? ?? [];
                final trackIds = rawList.map((x) => '$x'.trim()).where((x) => x.isNotEmpty).toList();
                if (id.isNotEmpty) {
                  _playlists.add(UserPlaylist(
                    id: id,
                    name: name.isEmpty ? 'My Playlist' : name,
                    trackIds: trackIds,
                  ));
                }
              }
            }
          }
        }
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[LibraryStore] Error loading library data: $e');
    } finally {
      _isLoaded = true;
      notifyListeners();
    }
  }

  void _save() {
    notifyListeners();
    if (!_isLoaded) {
      if (kDebugMode) debugPrint('[LibraryStore] Suppressed save: store not yet loaded from disk');
      return;
    }
    try {
      final json = jsonEncode({
        'liked': _liked,
        'artists': [for (final a in _artists) {'name': a.name, 'cover': a.cover}],
        'albums': [
          for (final a in _albums)
            {'title': a.title, 'artist': a.artist, 'cover': a.cover}
        ],
        'playlists': [
          for (final p in _playlists)
            {'id': p.id, 'name': p.name, 'tracks': p.trackIds}
        ],
        'tracks': {
          for (final entry in _seen.entries)
            entry.key: entry.value.toJson(),
        },
      });
      unawaited(storage.write(json));
    } catch (e) {
      if (kDebugMode) debugPrint('[LibraryStore] Error saving library data: $e');
    }
  }

  /* ── tracks ── */
  String _key(Track t) => t.id;

  List<Track> _resolve(Iterable<String> ids) {
    final index = <String, Track>{
      for (final t in CatalogDataSource.allTracks) t.id: t
    };
    final out = <Track>[];
    for (final id in ids) {
      final t = _seen[id] ?? index[id];
      if (t != null) {
        out.add(t);
      }
    }
    return out;
  }

  void registerTrack(Track t) {
    if (t.id.isEmpty) return;
    _seen[_key(t)] = t;
    _save();
  }

  /// All unique tracks across the entire library (liked + playlist songs)
  List<Track> get allLibraryTracks {
    final seenIds = <String>{};
    final out = <Track>[];
    for (final t in likedTracks) {
      if (seenIds.add(t.id)) out.add(t);
    }
    for (final p in _playlists) {
      for (final t in playlistTracks(p)) {
        if (seenIds.add(t.id)) out.add(t);
      }
    }
    return out;
  }

  /* ── liked songs ── */
  List<Track> get likedTracks => _resolve(_liked);
  int get likedCount => _liked.length;
  bool isLiked(Track t) => _liked.contains(_key(t));

  void toggleLike(Track t) {
    final k = _key(t);
    _seen[k] = t;
    if (!_liked.remove(k)) {
      _liked.insert(0, k);
    }
    _save();
  }

  void toggleLove(Track t) => toggleLike(t);

  /* ── artists ── */
  List<FollowedArtist> get followedArtists => List.unmodifiable(_artists);
  bool isFollowing(String name) => _artists.any((a) => a.name.toLowerCase() == name.trim().toLowerCase());

  void toggleFollow(String name, String cover) {
    final clean = name.trim();
    if (clean.isEmpty) return;
    final i = _artists.indexWhere((a) => a.name.toLowerCase() == clean.toLowerCase());
    if (i >= 0) {
      _artists.removeAt(i);
    } else {
      _artists.insert(0, FollowedArtist(clean, cover));
    }
    _save();
  }

  /* ── albums ── */
  List<SavedAlbum> get savedAlbums => List.unmodifiable(_albums);
  bool isAlbumSaved(String title, String artist) =>
      _albums.any((a) => a.title.toLowerCase() == title.trim().toLowerCase() && a.artist.toLowerCase() == artist.trim().toLowerCase());

  void toggleAlbum(String title, String artist, String cover) {
    final cTitle = title.trim();
    final cArtist = artist.trim();
    if (cTitle.isEmpty) return;
    final i = _albums.indexWhere(
      (a) => a.title.toLowerCase() == cTitle.toLowerCase() && a.artist.toLowerCase() == cArtist.toLowerCase(),
    );
    if (i >= 0) {
      _albums.removeAt(i);
    } else {
      _albums.insert(0, SavedAlbum(cTitle, cArtist, cover));
    }
    _save();
  }

  /* ── playlists ── */
  List<UserPlaylist> get playlists => List.unmodifiable(_playlists);

  UserPlaylist? playlistById(String id) {
    for (final p in _playlists) {
      if (p.id == id) return p;
    }
    return null;
  }

  List<Track> playlistTracks(UserPlaylist p) => _resolve(p.trackIds);

  UserPlaylist createPlaylist(String name, {Track? first}) {
    final p = UserPlaylist(
      id: DateTime.now().microsecondsSinceEpoch.toString(),
      name: name.trim().isEmpty ? 'My Playlist' : name.trim(),
    );
    if (first != null) {
      final k = _key(first);
      _seen[k] = first;
      p.trackIds.add(k);
    }
    _playlists.insert(0, p);
    _save();
    return p;
  }

  void renamePlaylist(String id, String name) {
    final p = playlistById(id);
    if (p == null || name.trim().isEmpty) return;
    p.name = name.trim();
    _save();
  }

  void deletePlaylist(String id) {
    _playlists.removeWhere((p) => p.id == id);
    _save();
  }

  /// Returns false if the song was already in the playlist.
  bool addToPlaylist(String id, Track t) {
    final p = playlistById(id);
    if (p == null) return false;
    final k = _key(t);
    _seen[k] = t;
    if (p.trackIds.contains(k)) return false;
    p.trackIds.add(k);
    _save();
    return true;
  }

  void removeFromPlaylist(String id, Track t) {
    playlistById(id)?.trackIds.remove(_key(t));
    _save();
  }
}
