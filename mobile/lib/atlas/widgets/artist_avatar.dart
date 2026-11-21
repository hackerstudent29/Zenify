import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/widgets.dart';

import '../core/atlas_tokens.dart';
import '../data/atlas_content.dart';

/// Circular artist photo with a gradient + initial fallback.
/// Pass [imageUrl] when already known to skip the lookup.
class ArtistAvatar extends StatefulWidget {
  const ArtistAvatar({
    super.key,
    required this.name,
    this.size = 40,
    this.imageUrl,
  });
  final String name;
  final double size;
  final String? imageUrl;

  @override
  State<ArtistAvatar> createState() => _ArtistAvatarState();
}

class _ArtistAvatarState extends State<ArtistAvatar> {
  Future<String?>? _img;

  Future<String?>? _resolve() {
    final u = widget.imageUrl;
    if (u != null && u.isNotEmpty) return null;
    return AtlasContent.instance.artistImage(widget.name);
  }

  @override
  void initState() {
    super.initState();
    _img = _resolve();
  }

  @override
  void didUpdateWidget(ArtistAvatar old) {
    super.didUpdateWidget(old);
    if (old.name != widget.name || old.imageUrl != widget.imageUrl) {
      _img = _resolve();
    }
  }

  Widget _photo(String? url) {
    if (url == null || url.isEmpty) return const SizedBox.shrink();
    return CachedNetworkImage(
      imageUrl: url,
      fit: BoxFit.cover,
      fadeInDuration: const Duration(milliseconds: 200),
      memCacheWidth: (widget.size * 3).round(),
      errorWidget: (context, url, error) => const SizedBox.shrink(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.size;
    return RepaintBoundary(
      child: SizedBox(
        width: s,
        height: s,
        child: ClipOval(
          child: Stack(
            fit: StackFit.expand,
            children: [
              _Fallback(name: widget.name, size: s),
              if (_img == null)
                _photo(widget.imageUrl)
              else
                FutureBuilder<String?>(
                  future: _img,
                  builder: (_, snap) => _photo(snap.data),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Fallback extends StatelessWidget {
  const _Fallback({required this.name, required this.size});
  final String name;
  final double size;

  @override
  Widget build(BuildContext context) {
    final h = (name.hashCode.abs() % 360).toDouble();
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            HSLColor.fromAHSL(1, h, 0.30, 0.34).toColor(),
            HSLColor.fromAHSL(1, (h + 32) % 360, 0.32, 0.20).toColor(),
          ],
        ),
      ),
      child: Center(
        child: Text(
          name.isEmpty ? '' : name.characters.first.toUpperCase(),
          style: AtlasText.headline.copyWith(fontSize: size * 0.4),
        ),
      ),
    );
  }
}
