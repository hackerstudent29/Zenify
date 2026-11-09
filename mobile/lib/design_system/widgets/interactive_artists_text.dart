import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import '../../models/artist_ref.dart';
import '../../utils/media_normalizer.dart';
import '../../views/details/artist_popup.dart';
import '../../views/details/artist_screen.dart';

/// Interactive artist text widget that parses and renders individual artists
/// as distinct, clickable links rather than a single monolithic un-navigable string.
class InteractiveArtistsText extends StatelessWidget {
  const InteractiveArtistsText({
    super.key,
    required this.artists,
    this.style,
    this.separatorStyle,
    this.maxLines = 1,
    this.overflow = TextOverflow.ellipsis,
    this.textAlign = TextAlign.start,
    this.onTapArtist,
  });

  /// Can be a composite [String], a [List<String>], or a [List<ArtistRef>].
  final dynamic artists;
  final TextStyle? style;
  final TextStyle? separatorStyle;
  final int maxLines;
  final TextOverflow overflow;
  final TextAlign textAlign;
  final void Function(String artistName)? onTapArtist;

  void _handleTap(BuildContext context, String artistName, {List<ArtistRef>? refs}) {
    final clean = MediaNormalizer.cleanArtistName(artistName);
    if (clean.isEmpty || clean == 'Unknown Artist') return;
    if (onTapArtist != null) {
      onTapArtist!(clean);
    } else {
      String? browseId;
      String? imageUrl;
      if (refs != null && refs.isNotEmpty) {
        final match = refs.where((r) => r.name.toLowerCase() == clean.toLowerCase()).firstOrNull;
        if (match != null) {
          if (match.id.isNotEmpty && !match.id.contains('_')) {
            browseId = match.id;
          }
          imageUrl = match.imageUrl;
        }
      }
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => ArtistScreen(
            artistName: clean,
            browseId: browseId,
            imageUrl: imageUrl,
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final List<ArtistRef> refs = [];
    final List<String> names = [];

    void addName(String name) {
      final clean = MediaNormalizer.cleanArtistName(name);
      if (clean.isNotEmpty && !names.contains(clean) && !clean.contains("Instance of 'ArtistRef'")) {
        names.add(clean);
      }
    }

    if (artists is List<ArtistRef>) {
      for (final a in artists as List<ArtistRef>) {
        final split = ArtistRef.splitFromName(a.name, defaultImageUrl: a.imageUrl);
        refs.addAll(split);
        for (final r in split) {
          addName(r.name);
        }
      }
    } else if (artists is Iterable) {
      for (final item in artists as Iterable) {
        if (item is ArtistRef) {
          final split = ArtistRef.splitFromName(item.name, defaultImageUrl: item.imageUrl);
          refs.addAll(split);
          for (final r in split) {
            addName(r.name);
          }
        } else if (item != null) {
          final split = ArtistRef.splitFromName(item);
          refs.addAll(split);
          for (final r in split) {
            addName(r.name);
          }
        }
      }
    } else if (artists != null) {
      final split = ArtistRef.splitFromName(artists);
      refs.addAll(split);
      for (final r in split) {
        addName(r.name);
      }
    }

    if (names.isEmpty) {
      final splitFallback = MediaNormalizer.splitArtistNames(artists);
      for (final n in splitFallback) {
        addName(n);
        refs.add(ArtistRef.fromName(n));
      }
    }

    if (names.isEmpty) {
      return Text(
        'Unknown Artist',
        style: style,
        maxLines: maxLines,
        overflow: overflow,
        textAlign: textAlign,
      );
    }

    if (names.length == 1) {
      final single = names.first;
      return GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => _handleTap(context, single, refs: refs),
        child: Text(
          single,
          style: style,
          maxLines: maxLines,
          overflow: overflow,
          textAlign: textAlign,
        ),
      );
    }

    final effectiveStyle = style ?? DefaultTextStyle.of(context).style;
    final effectiveSepStyle = separatorStyle ?? effectiveStyle.copyWith(color: effectiveStyle.color?.withValues(alpha: 0.6));

    final spans = <InlineSpan>[];
    for (var i = 0; i < names.length; i++) {
      final name = names[i];
      spans.add(
        TextSpan(
          text: name,
          style: effectiveStyle,
          recognizer: TapGestureRecognizer()..onTap = () => _handleTap(context, name, refs: refs),
        ),
      );
      if (i < names.length - 1) {
        spans.add(
          TextSpan(
            text: i == names.length - 2 ? ' & ' : ', ',
            style: effectiveSepStyle,
          ),
        );
      }
    }

    return GestureDetector(
      onLongPress: () {
        showArtistPopup(context, artists: refs);
      },
      child: Text.rich(
        TextSpan(children: spans),
        maxLines: maxLines,
        overflow: overflow,
        textAlign: textAlign,
      ),
    );
  }
}
