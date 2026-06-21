class Artist {
  final String id;
  final String name;
  final String? bio;
  final String? imageUrl;
  final String? coverUrl;
  final int? monthlyListeners;
  final List<Track>? tracks;

  Artist({
    required this.id,
    required this.name,
    this.bio,
    this.imageUrl,
    this.coverUrl,
    this.monthlyListeners,
    this.tracks,
  });

  factory Artist.fromJson(Map<String, dynamic> json) {
    return Artist(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Unknown Artist',
      bio: json['bio']?.toString(),
      imageUrl: json['imageUrl']?.toString() ?? json['image_url']?.toString(), // Fallbacks depending on backend casing
      coverUrl: json['coverUrl']?.toString() ?? json['cover_url']?.toString(),
      monthlyListeners: json['monthlyListeners'] as int?,
      tracks: json['tracks'] != null 
          ? (json['tracks'] as List).map((t) => Track.fromJson(t)).toList()
          : null,
    );
  }
}

class Album {
  final String id;
  final String title;
  final String? coverUrl;
  final String artistId;
  final Artist? artist;

  Album({
    required this.id,
    required this.title,
    this.coverUrl,
    required this.artistId,
    this.artist,
  });

  factory Album.fromJson(Map<String, dynamic> json) {
    return Album(
      id: json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? 'Unknown Album',
      coverUrl: json['coverUrl']?.toString() ?? json['cover_url']?.toString(),
      artistId: json['artistId']?.toString() ?? json['artist_id']?.toString() ?? '',
      artist: json['artist'] != null ? Artist.fromJson(json['artist']) : null,
    );
  }
}

class Track {
  final String id;
  final String title;
  final String artistId;
  final String? albumId;
  final String? coverUrl;
  final String audioUrl;
  final int duration;
  final int? streams;
  final Artist? artist;
  final Album? album;

  Track({
    required this.id,
    required this.title,
    required this.artistId,
    this.albumId,
    this.coverUrl,
    required this.audioUrl,
    required this.duration,
    this.streams,
    this.artist,
    this.album,
  });

  factory Track.fromJson(Map<String, dynamic> json) {
    return Track(
      id: json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? 'Unknown Track',
      artistId: json['artistId']?.toString() ?? json['artist_id']?.toString() ?? '',
      albumId: json['albumId']?.toString() ?? json['album_id']?.toString(),
      coverUrl: json['coverUrl']?.toString() ?? json['cover_url']?.toString(),
      audioUrl: json['audioUrl']?.toString() ?? json['audio_url']?.toString() ?? '',
      duration: json['duration'] as int? ?? 0,
      streams: json['streams'] as int?,
      artist: json['artist'] != null ? Artist.fromJson(json['artist']) : null,
      album: json['album'] != null ? Album.fromJson(json['album']) : null,
    );
  }
}

class Playlist {
  final String id;
  final String name;
  final String? description;
  final String? coverUrl;
  final String userId;

  Playlist({
    required this.id,
    required this.name,
    this.description,
    this.coverUrl,
    required this.userId,
  });

  factory Playlist.fromJson(Map<String, dynamic> json) {
    return Playlist(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Unknown Playlist',
      description: json['description']?.toString(),
      coverUrl: json['coverUrl']?.toString() ?? json['cover_url']?.toString(),
      userId: json['userId']?.toString() ?? json['user_id']?.toString() ?? '',
    );
  }
}
