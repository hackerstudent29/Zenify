import 'dart:async';
import 'dart:convert';

import 'package:flutter/cupertino.dart' show CupertinoIcons;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart' show Color, Colors, Icon, Icons;
import 'package:shared_preferences/shared_preferences.dart';

import '../data/datasources/catalog_datasource.dart';
import '../design_system/widgets/dynamic_island_header.dart';
import '../models/track.dart';
import '../utils/media_normalizer.dart';
import 'api_service.dart';

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
  PrefsLibraryStorage({this.userId});
  final String? userId;

  String get _keyPrimary => (userId != null && userId!.trim().isNotEmpty)
      ? 'library_user_${userId!.trim()}'
      : 'library_v1';
  String get _keyBackup => '${_keyPrimary}_backup';

  @override
  Future<String?> read() async {
    try {
      final p = await SharedPreferences.getInstance();
      await p.reload();
      final val = p.getString(_keyPrimary);
      if (val != null && val.trim().isNotEmpty && val.trim().length > 10) return val;
      final backup = p.getString(_keyBackup);
      if (backup != null && backup.trim().isNotEmpty && backup.trim().length > 10) return backup;

      // Safe migration: if this is an authenticated user with no data yet,
      // but legacy shared library exists, migrate it safely to user's storage
      // while keeping legacy backup untouched!
      if (userId != null && userId!.trim().isNotEmpty) {
        final legacy = p.getString('library_v1');
        if (legacy != null && legacy.trim().isNotEmpty && legacy.trim().length > 10) {
          await p.setString('library_legacy_backup', legacy);
          await p.setString(_keyPrimary, legacy);
          return legacy;
        }
      }
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

  String? _activeUserId;
  String? get activeUserId => _activeUserId;

  final Map<String, Track> _seen = {};
  final List<String> _liked = [];
  final List<FollowedArtist> _artists = [];
  final List<SavedAlbum> _albums = [];
  final List<UserPlaylist> _playlists = [];
  Future<void>? _loading;
  bool _isLoaded = false;

  bool get isLoaded => _isLoaded;

  /// Switches the active library user cleanly (handles login, logout, account switching).
  Future<void> switchUser(String? userId) async {
    final cleanId = userId?.trim();
    if (_activeUserId == cleanId && _isLoaded) return;
    _activeUserId = cleanId;
    if (storage is PrefsLibraryStorage) {
      storage = PrefsLibraryStorage(userId: cleanId);
    }

    // Reset in-memory state cleanly
    _seen.clear();
    _liked.clear();
    _artists.clear();
    _albums.clear();
    _playlists.clear();
    _isLoaded = false;
    _loading = null;

    await ensureLoaded();

    // If authenticated user, fetch and merge backend data
    if (cleanId != null && cleanId.isNotEmpty) {
      try {
        final remote = await ApiService.fetchUserLibrary();
        if (remote != null) {
          bool changed = false;
          // 1. Saved albums
          final remoteAlbums = remote['albums'] as List?;
          if (remoteAlbums != null) {
            for (final item in remoteAlbums) {
              if (item is Map) {
                final title = (item['title'] as String? ?? '').trim();
                final artist = (item['artist'] as String? ?? '').trim();
                final cover = MediaNormalizer.upgradeArtworkUrl((item['coverUrl'] as String? ?? '').trim());
                if (title.isNotEmpty && !isAlbumSaved(title, artist)) {
                  _albums.add(SavedAlbum(title, artist, cover));
                  changed = true;
                }
              }
            }
          }
          // 2. Liked songs
          final remoteLiked = remote['liked'] as List?;
          if (remoteLiked != null) {
            for (final item in remoteLiked) {
              if (item is Map) {
                final id = (item['id'] as String? ?? '').trim();
                if (id.isNotEmpty && !_liked.contains(id)) {
                  _liked.add(id);
                  try {
                    _seen[id] = Track.fromJson(Map<String, dynamic>.from(item));
                  } catch (_) {}
                  changed = true;
                }
              }
            }
          }
          // 3. Followed artists
          final remoteArtists = remote['artists'] as List?;
          if (remoteArtists != null) {
            for (final item in remoteArtists) {
              if (item is Map) {
                final name = (item['name'] as String? ?? '').trim();
                final cover = MediaNormalizer.upgradeArtworkUrl(
                  (item['coverUrl'] as String? ?? '').trim(),
                  isArtistAvatar: true,
                );
                if (name.isNotEmpty && !isFollowing(name)) {
                  _artists.add(FollowedArtist(name, cover));
                  changed = true;
                }
              }
            }
          }
          if (changed) _save();
        }
      } catch (e) {
        if (kDebugMode) debugPrint('[LibraryStore] Failed to sync remote library: $e');
      }
    }

    notifyListeners();
  }

  /// Clears in-memory state on sign-out so another account starts fresh.
  void clearForSignOut() {
    _activeUserId = null;
    if (storage is PrefsLibraryStorage) {
      storage = PrefsLibraryStorage(userId: null);
    }
    _seen.clear();
    _liked.clear();
    _artists.clear();
    _albums.clear();
    _playlists.clear();
    _isLoaded = true;
    notifyListeners();
  }

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
                final cover = MediaNormalizer.upgradeArtworkUrl(
                  (item['cover'] as String? ?? '').trim(),
                  isArtistAvatar: true,
                );
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
                final cover = MediaNormalizer.upgradeArtworkUrl(
                  (item['cover'] as String? ?? '').trim(),
                );
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
    final target = IslandNotification.artistOrTitle(artist: t.artist, title: t.title);
    final isAdd = !_liked.remove(k);
    if (isAdd) {
      _liked.insert(0, k);
      IslandNotifier.instance.show(
        IslandNotification(
          id: 'like_${t.id}_${DateTime.now().millisecondsSinceEpoch}',
          title: 'Liked',
          body: target,
          leading: IslandNotification.trackThumb(t.coverUrl, fallbackIcon: Icons.favorite_rounded, iconColor: const Color(0xFFE11D48)),
        ),
      );
    } else {
      IslandNotifier.instance.show(
        IslandNotification(
          id: 'unlike_${t.id}_${DateTime.now().millisecondsSinceEpoch}',
          title: 'Unliked',
          body: target,
          leading: IslandNotification.trackThumb(t.coverUrl, fallbackIcon: Icons.favorite_border_rounded, iconColor: Colors.white70),
        ),
      );
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
      IslandNotifier.instance.show(
        IslandNotification(
          id: 'unfollow_${clean}_${DateTime.now().millisecondsSinceEpoch}',
          title: 'Unfollowed',
          body: clean,
          leading: IslandNotification.trackThumb(cover, fallbackIcon: CupertinoIcons.person_crop_circle, iconColor: Colors.white70),
        ),
      );
    } else {
      _artists.insert(0, FollowedArtist(clean, cover));
      IslandNotifier.instance.show(
        IslandNotification(
          id: 'follow_${clean}_${DateTime.now().millisecondsSinceEpoch}',
          title: 'Following',
          body: clean,
          leading: IslandNotification.trackThumb(cover, fallbackIcon: CupertinoIcons.person_crop_circle_badge_checkmark, iconColor: const Color(0xFFE11D48)),
        ),
      );
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
    final target = IslandNotification.artistOrTitle(artist: cArtist, title: cTitle);
    final i = _albums.indexWhere(
      (a) => a.title.toLowerCase() == cTitle.toLowerCase() && a.artist.toLowerCase() == cArtist.toLowerCase(),
    );
    if (i >= 0) {
      _albums.removeAt(i);
      if (_activeUserId != null && _activeUserId!.isNotEmpty) {
        unawaited(ApiService.removeUserAlbum(cTitle, cArtist));
      }
      IslandNotifier.instance.show(
        IslandNotification(
          id: 'album_rm_${cTitle}_${DateTime.now().millisecondsSinceEpoch}',
          title: 'Removed',
          body: target,
          leading: IslandNotification.trackThumb(cover, fallbackIcon: CupertinoIcons.music_albums, iconColor: Colors.white70),
        ),
      );
    } else {
      _albums.insert(0, SavedAlbum(cTitle, cArtist, cover));
      if (_activeUserId != null && _activeUserId!.isNotEmpty) {
        unawaited(ApiService.saveUserAlbum({
          'title': cTitle,
          'artist': cArtist,
          'coverUrl': cover,
        }));
      }
      IslandNotifier.instance.show(
        IslandNotification(
          id: 'album_add_${cTitle}_${DateTime.now().millisecondsSinceEpoch}',
          title: 'Saved',
          body: target,
          leading: IslandNotification.trackThumb(cover, fallbackIcon: CupertinoIcons.music_albums, iconColor: const Color(0xFFE11D48)),
        ),
      );
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
    IslandNotifier.instance.show(
      IslandNotification(
        id: 'playlist_create_${p.id}',
        title: 'Created',
        body: p.name,
        leading: const Icon(CupertinoIcons.text_badge_plus, color: Color(0xFFE11D48), size: 18),
      ),
    );
    return p;
  }

  void renamePlaylist(String id, String name) {
    final p = playlistById(id);
    if (p == null || name.trim().isEmpty) return;
    p.name = name.trim();
    _save();
    IslandNotifier.instance.show(
      IslandNotification(
        id: 'playlist_rename_$id',
        title: 'Renamed',
        body: p.name,
        leading: const Icon(CupertinoIcons.pencil, color: Color(0xFFE11D48), size: 18),
      ),
    );
  }

  void deletePlaylist(String id) {
    final p = playlistById(id);
    final name = p?.name ?? 'Playlist';
    _playlists.removeWhere((p) => p.id == id);
    _save();
    IslandNotifier.instance.show(
      IslandNotification(
        id: 'playlist_del_$id',
        title: 'Deleted',
        body: name,
        leading: const Icon(CupertinoIcons.trash, color: Colors.white70, size: 18),
      ),
    );
  }

  /// Returns false if the song was already in the playlist.
  bool addToPlaylist(String id, Track t) {
    final p = playlistById(id);
    if (p == null) return false;
    final k = _key(t);
    _seen[k] = t;
    final target = IslandNotification.artistOrTitle(artist: t.artist, title: t.title);
    if (p.trackIds.contains(k)) {
      IslandNotifier.instance.show(
        IslandNotification(
          id: 'playlist_exists_${t.id}_${DateTime.now().millisecondsSinceEpoch}',
          title: 'In ${p.name}',
          body: target,
          leading: const Icon(CupertinoIcons.info_circle, color: Color(0xFFFFCC00), size: 18),
        ),
      );
      return false;
    }
    p.trackIds.add(k);
    _save();
    IslandNotifier.instance.show(
      IslandNotification(
        id: 'playlist_add_${t.id}_${DateTime.now().millisecondsSinceEpoch}',
        title: 'Added',
        body: target,
        leading: IslandNotification.trackThumb(t.coverUrl, fallbackIcon: CupertinoIcons.music_note_list, iconColor: const Color(0xFFE11D48)),
      ),
    );
    return true;
  }

  void removeFromPlaylist(String id, Track t) {
    final p = playlistById(id);
    p?.trackIds.remove(_key(t));
    _save();
    if (p != null) {
      IslandNotifier.instance.show(
        IslandNotification(
          id: 'playlist_rm_${t.id}_${DateTime.now().millisecondsSinceEpoch}',
          title: 'Removed',
          body: IslandNotification.artistOrTitle(artist: t.artist, title: t.title),
          leading: const Icon(CupertinoIcons.minus_circle, color: Colors.white70, size: 18),
        ),
      );
    }
  }
}
