import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../data/datasources/catalog_datasource.dart';
import '../models/track.dart';

/* ------------------------------------------------------------------ */
/*  Storage                                                             */
/* ------------------------------------------------------------------ */

/// Where the library is saved. The default keeps it in memory only.
///
/// To keep it between launches, set a storage once at startup, e.g. with
/// shared_preferences:
///
/// ```dart
/// class PrefsLibraryStorage implements LibraryStorage {
///   @override
///   Future<String?> read() async => (await SharedPreferences.getInstance()).getString('library_v1');
///   @override
///   Future<void> write(String json) async =>
///       (await SharedPreferences.getInstance()).setString('library_v1', json);
/// }
/// // main(): LibraryStore.storage = PrefsLibraryStorage();
/// ```
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
  @override
  Future<String?> read() async {
    try {
      final p = await SharedPreferences.getInstance();
      return p.getString('library_v1');
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> write(String json) async {
    try {
      final p = await SharedPreferences.getInstance();
      await p.setString('library_v1', json);
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
///
/// A singleton `ChangeNotifier`, so no provider setup is needed:
/// `ListenableBuilder(listenable: LibraryStore.instance, ...)`.
///
/// Songs are saved by id and looked up again from the catalog (or from songs
/// seen this session), so a song that is not in the catalog cannot be restored
/// after a restart.
class LibraryStore extends ChangeNotifier {
  LibraryStore._();
  static final LibraryStore instance = LibraryStore._();
  static LibraryStorage storage = PrefsLibraryStorage();

  final Map<String, Track> _seen = {};
  final List<String> _liked = [];
  final List<FollowedArtist> _artists = [];
  final List<SavedAlbum> _albums = [];
  final List<UserPlaylist> _playlists = [];
  Future<void>? _loading;

  Future<void> ensureLoaded() => _loading ??= _load();

  Future<void> _load() async {
    try {
      final raw = await storage.read();
      if (raw != null && raw.isNotEmpty) {
        final j = jsonDecode(raw) as Map<String, dynamic>;
        _liked
          ..clear()
          ..addAll((j['liked'] as List? ?? []).map((e) => '$e'));
        _artists
          ..clear()
          ..addAll((j['artists'] as List? ?? []).map((e) => FollowedArtist(
                e['name'] as String? ?? '',
                e['cover'] as String? ?? '',
              )));
        _albums
          ..clear()
          ..addAll((j['albums'] as List? ?? []).map((e) => SavedAlbum(
                e['title'] as String? ?? '',
                e['artist'] as String? ?? '',
                e['cover'] as String? ?? '',
              )));
        _playlists
          ..clear()
          ..addAll((j['playlists'] as List? ?? []).map((e) => UserPlaylist(
                id: e['id'] as String? ?? '',
                name: e['name'] as String? ?? '',
                trackIds:
                    (e['tracks'] as List? ?? []).map((x) => '$x').toList(),
              )));
      }
    } catch (_) {/* corrupted data: start empty */}
    notifyListeners();
  }

  void _save() {
    notifyListeners();
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
    });
    unawaited(storage.write(json));
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
      if (t != null) out.add(t);
    }
    return out;
  }

  void registerTrack(Track t) {
    _seen[_key(t)] = t;
  }

  /* ── liked songs ── */
  List<Track> get likedTracks => _resolve(_liked);
  int get likedCount => _liked.length;
  bool isLiked(Track t) => _liked.contains(_key(t));

  void toggleLike(Track t) {
    final k = _key(t);
    if (!_liked.remove(k)) {
      _seen[k] = t;
      _liked.insert(0, k);
    }
    _save();
  }

  void toggleLove(Track t) => toggleLike(t);

  /* ── artists ── */
  List<FollowedArtist> get followedArtists => List.unmodifiable(_artists);
  bool isFollowing(String name) => _artists.any((a) => a.name == name);

  void toggleFollow(String name, String cover) {
    final i = _artists.indexWhere((a) => a.name == name);
    if (i >= 0) {
      _artists.removeAt(i);
    } else {
      _artists.insert(0, FollowedArtist(name, cover));
    }
    _save();
  }

  /* ── albums ── */
  List<SavedAlbum> get savedAlbums => List.unmodifiable(_albums);
  bool isAlbumSaved(String title, String artist) =>
      _albums.any((a) => a.title == title && a.artist == artist);

  void toggleAlbum(String title, String artist, String cover) {
    final i =
        _albums.indexWhere((a) => a.title == title && a.artist == artist);
    if (i >= 0) {
      _albums.removeAt(i);
    } else {
      _albums.insert(0, SavedAlbum(title, artist, cover));
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
        name: name.isEmpty ? 'New playlist' : name);
    if (first != null) {
      _seen[_key(first)] = first;
      p.trackIds.add(_key(first));
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
    if (p.trackIds.contains(k)) return false;
    _seen[k] = t;
    p.trackIds.add(k);
    _save();
    return true;
  }

  void removeFromPlaylist(String id, Track t) {
    playlistById(id)?.trackIds.remove(_key(t));
    _save();
  }
}

