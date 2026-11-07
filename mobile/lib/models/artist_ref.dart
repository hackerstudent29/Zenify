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

  factory ArtistRef.fromJson(Map<String, dynamic> json) => ArtistRef(
        id: json['id']?.toString() ?? json['browseId']?.toString() ?? '',
        name: json['name']?.toString() ?? json['title']?.toString() ?? 'Unknown Artist',
        imageUrl: json['imageUrl']?.toString() ??
            json['thumb']?.toString() ??
            json['avatarUrl']?.toString(),
        role: json['role']?.toString(),
      );

  factory ArtistRef.fromName(String name, {String? id, String? imageUrl}) => ArtistRef(
        id: id ?? name.toLowerCase().replaceAll(RegExp(r'\s+'), '_'),
        name: name.trim().isEmpty ? 'Unknown Artist' : name.trim(),
        imageUrl: imageUrl,
      );

  /// Apple Music formatting: "A", "A & B", "A, B & C".
  static String formatList(List<ArtistRef> list, {String fallback = 'Unknown Artist'}) {
    if (list.isEmpty) return fallback;
    final names = list.map((a) => a.name.trim()).where((n) => n.isNotEmpty).toList();
    if (names.isEmpty) return fallback;
    if (names.length == 1) return names.first;
    if (names.length == 2) return '${names[0]} & ${names[1]}';
    return '${names.sublist(0, names.length - 1).join(', ')} & ${names.last}';
  }
}

