import 'package:flutter/widgets.dart';

import 'story_models.dart';
import 'story_service.dart';
import 'story_templates_album.dart';
import 'story_templates_artist.dart';
import 'story_templates_lyrics.dart';
import 'story_templates_playlist.dart';
import 'story_templates_song.dart';
import 'story_widgets.dart';

export 'story_template_kit.dart';

// ═════════════════════════════════════════════════════════════════════════════
// REGISTRY + PREVIEW WIDGET
// Every layout is skin-aware, so 110 designs come from 55 layouts × 10 skins.
// ═════════════════════════════════════════════════════════════════════════════

class StoryTemplateRegistry {
  StoryTemplateRegistry._();

  static Widget build(StoryShareContent content, StoryTemplate t, StoryTemplateArgs a) {
    if (content is SongStoryContent) return buildSong(content, a);
    if (content is LyricsStoryContent) return buildLyrics(content, a);
    if (content is AlbumStoryContent) return buildAlbum(content, a);
    if (content is ArtistStoryContent) return buildArtist(content, a);
    if (content is PlaylistStoryContent) return buildPlaylist(content, a);
    return const SizedBox.shrink();
  }
}

/// Renders the active template inside the clean export viewport, at the
/// template's OWN ratio.
class StoryCardPreview extends StatelessWidget {
  const StoryCardPreview({
    super.key,
    required this.content,
    required this.template,
    required this.palette,
    required this.backgroundStyle,
    required this.textPolarity,
    this.boundaryKey,
  });

  final StoryShareContent content;
  final StoryTemplate template;
  final ArtworkPalette palette;
  final StoryBackgroundStyle backgroundStyle;
  final StoryTextPolarity textPolarity;
  final GlobalKey? boundaryKey;

  @override
  Widget build(BuildContext context) {
    final args = StoryTemplateArgs(
      template: template,
      palette: palette,
      backgroundStyle: backgroundStyle,
      textPolarity: textPolarity,
    );
    return StoryCardViewport(
      ratio: template.ratio,
      boundaryKey: boundaryKey,
      child: DefaultTextStyle.merge(
        style: const TextStyle(decoration: TextDecoration.none),
        child: StoryTemplateRegistry.build(content, template, args),
      ),
    );
  }
}
