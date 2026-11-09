import '../utils/media_normalizer.dart';

/// Model representing a referenced artist (primary, featured, or collaborator).
class ArtistRef {
  const ArtistRef({
    required this.id,
    required this.name,
    this.imageUrl,
    this.role,
  });

  final String id;
  final String name;
  final String? imageUrl;
  final String? role;

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        if (imageUrl != null) 'imageUrl': imageUrl,
        if (role != null) 'role': role,
      };

  factory ArtistRef.fromJson(Map<String, dynamic> json) {
    final rawName = json['name']?.toString() ?? json['title']?.toString() ?? 'Unknown Artist';
    final clean = MediaNormalizer.cleanArtistName(rawName);
    return ArtistRef(
      id: json['id']?.toString() ?? json['browseId']?.toString() ?? '',
      name: clean.isEmpty ? 'Unknown Artist' : clean,
      imageUrl: json['imageUrl']?.toString() ??
          json['thumb']?.toString() ??
          json['avatarUrl']?.toString(),
      role: json['role']?.toString(),
    );
  }

  factory ArtistRef.fromName(String name, {String? id, String? imageUrl}) {
    final clean = MediaNormalizer.cleanArtistName(name);
    return ArtistRef(
      id: id ?? clean.toLowerCase().replaceAll(RegExp(r'\s+'), '_'),
      name: clean.isEmpty ? 'Unknown Artist' : clean,
      imageUrl: imageUrl,
    );
  }

  /// Splits composite names and creates individual ArtistRef models.
  static List<ArtistRef> splitFromName(dynamic raw, {String? defaultImageUrl}) {
    if (raw == null) return const [];
    if (raw is ArtistRef) return [raw];
    if (raw is List<ArtistRef>) return raw;
    if (raw is Iterable) {
      final out = <ArtistRef>[];
      for (final item in raw) {
        if (item is ArtistRef) {
          out.add(item);
        } else if (item != null) {
          out.addAll(splitFromName(item, defaultImageUrl: defaultImageUrl));
        }
      }
      if (out.isNotEmpty) return out;
    }
    final str = raw is ArtistRef ? raw.name : raw.toString().trim();
    if (str.isEmpty || str.contains("Instance of 'ArtistRef'")) return const [];
    final names = MediaNormalizer.splitArtistNames(str);
    if (names.isEmpty) {
      final clean = MediaNormalizer.cleanArtistName(str);
      if (clean.isNotEmpty && !clean.contains("Instance of 'ArtistRef'")) {
        return [ArtistRef.fromName(clean, imageUrl: defaultImageUrl)];
      }
      return const [];
    }
    return names.map((n) => ArtistRef.fromName(n, imageUrl: defaultImageUrl)).toList();
  }

  /// Apple Music formatting: "A", "A & B", "A, B & C".
  static String formatList(List<ArtistRef> list, {String fallback = 'Unknown Artist'}) {
    if (list.isEmpty) return fallback;
    final names = list.map((a) => a.name.trim()).where((n) => n.isNotEmpty && !n.contains("Instance of 'ArtistRef'")).toList();
    if (names.isEmpty) return fallback;
    if (names.length == 1) return names.first;
    if (names.length == 2) return '${names[0]} & ${names[1]}';
    return '${names.sublist(0, names.length - 1).join(', ')} & ${names.last}';
  }

  @override
  String toString() => name;
}

