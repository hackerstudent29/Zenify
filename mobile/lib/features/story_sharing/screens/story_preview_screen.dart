import 'dart:io';
import 'dart:math' as math;
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../design_system/apple/apple_kit.dart' hide ArtworkPalette;
import '../../../design_system/widgets/dynamic_island_header.dart';
import '../models/story_customization.dart';
import '../models/story_share_content.dart';
import '../models/story_template.dart';
import '../services/artwork_palette_service.dart';
import '../services/gallery_save_service.dart';
import '../services/story_image_renderer.dart';
import '../services/story_sharing_service.dart';
import '../widgets/story_card_preview.dart';
import '../widgets/story_share_controls.dart';
import '../widgets/story_template_selector.dart';

/// Full-screen Story Preview & Template Selection Screen.
class StoryPreviewScreen extends StatefulWidget {
  const StoryPreviewScreen({
    super.key,
    required this.content,
    this.initialTemplateId,
  });

  final StoryShareContent content;
  final String? initialTemplateId;

  @override
  State<StoryPreviewScreen> createState() => _StoryPreviewScreenState();
}

class _StoryPreviewScreenState extends State<StoryPreviewScreen> {
  final GlobalKey _boundaryKey = GlobalKey();
  late final PageController _pageController;

  late final List<StoryTemplate> _availableTemplates;
  late StoryTemplate _currentTemplate;

  StoryAspectRatio _aspectRatio = StoryAspectRatio.story;
  StoryBackgroundStyle _backgroundStyle = StoryBackgroundStyle.artMesh;
  StoryTextPolarity _textPolarity = StoryTextPolarity.light;

  ArtworkPalette _palette = ArtworkPalette.defaultPalette;
  bool _isExporting = false;

  @override
  void initState() {
    super.initState();
    _availableTemplates = _resolveTemplatesForContent(widget.content);

    // Initial template matching requested or fallback to first
    final initId = widget.initialTemplateId;
    _currentTemplate = _availableTemplates.firstWhere(
      (t) => t.id == initId,
      orElse: () => _availableTemplates.first,
    );

    final initialIndex = _availableTemplates.indexOf(_currentTemplate);
    _pageController = PageController(initialPage: initialIndex >= 0 ? initialIndex : 0);

    _loadPreferences();
    _extractArtworkPalette();
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  List<StoryTemplate> _resolveTemplatesForContent(StoryShareContent c) {
    if (c is SongStoryContent) return StoryTemplate.songTemplates;
    if (c is LyricsStoryContent) return StoryTemplate.lyricsTemplates;
    if (c is ArtistStoryContent) return StoryTemplate.artistTemplates;
    if (c is AlbumStoryContent) return StoryTemplate.albumTemplates;
    if (c is PlaylistStoryContent) return StoryTemplate.playlistTemplates;
    return StoryTemplate.songTemplates;
  }

  Future<void> _loadPreferences() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final savedTemplateId = prefs.getString('zenify_story_last_template_${widget.content.contentType}');
      if (savedTemplateId != null && mounted) {
        final match = _availableTemplates.firstWhere(
          (t) => t.id == savedTemplateId,
          orElse: () => _currentTemplate,
        );
        if (match.id != _currentTemplate.id) {
          final idx = _availableTemplates.indexOf(match);
          if (idx >= 0 && _pageController.hasClients) {
            _pageController.jumpToPage(idx);
          }
          setState(() => _currentTemplate = match);
        }
      }
    } catch (_) {}
  }

  Future<void> _savePreference(String templateId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        'zenify_story_last_template_${widget.content.contentType}',
        templateId,
      );
    } catch (_) {}
  }

  Future<void> _extractArtworkPalette() async {
    final pal = await ArtworkPaletteService.instance.extractPalette(
      widget.content.coverUrl,
      cacheKey: '${widget.content.contentType}_${widget.content.title}',
    );
    if (mounted) {
      setState(() => _palette = pal);
    }
  }

  void _onTemplateSelected(StoryTemplate template) {
    final index = _availableTemplates.indexOf(template);
    if (index >= 0 && _pageController.hasClients) {
      _pageController.animateToPage(
        index,
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOutCubic,
      );
    }
    setState(() => _currentTemplate = template);
    _savePreference(template.id);
  }

  void _onPageChanged(int index) {
    if (index >= 0 && index < _availableTemplates.length) {
      setState(() => _currentTemplate = _availableTemplates[index]);
      _savePreference(_availableTemplates[index].id);
    }
  }

  void _toggleAspectRatio() {
    setState(() {
      _aspectRatio = _aspectRatio == StoryAspectRatio.story
          ? StoryAspectRatio.square
          : StoryAspectRatio.story;
    });
  }

  void _toggleBackgroundStyle() {
    setState(() {
      const styles = StoryBackgroundStyle.values;
      final nextIdx = (styles.indexOf(_backgroundStyle) + 1) % styles.length;
      _backgroundStyle = styles[nextIdx];
    });
  }

  void _toggleTextPolarity() {
    setState(() {
      _textPolarity = _textPolarity == StoryTextPolarity.light
          ? StoryTextPolarity.dark
          : StoryTextPolarity.light;
    });
  }

  Future<File?> _captureCurrentCard() async {
    setState(() => _isExporting = true);
    try {
      final result = await StoryImageRenderer.captureToPng(
        _boundaryKey,
        filePrefix: 'zenify_${widget.content.contentType}',
        pixelRatio: 3.0,
      );
      return result?.file;
    } finally {
      if (mounted) setState(() => _isExporting = false);
    }
  }

  Future<void> _shareInstagram() async {
    final file = await _captureCurrentCard();
    if (file == null) return;
    await StorySharingService.shareToInstagram(
      file,
      topColor: _palette.primary,
      bottomColor: _palette.background,
      fallbackText: widget.content.shareText,
    );
  }

  Future<void> _shareFacebook() async {
    final file = await _captureCurrentCard();
    if (file == null) return;
    await StorySharingService.shareToFacebook(
      file,
      fallbackText: widget.content.shareText,
    );
  }

  Future<void> _shareWhatsApp() async {
    final file = await _captureCurrentCard();
    if (file == null) return;
    await StorySharingService.shareToWhatsApp(
      file,
      text: widget.content.shareText,
    );
  }

  Future<void> _shareMore() async {
    final file = await _captureCurrentCard();
    if (file == null) return;
    await StorySharingService.shareToSystem(
      file,
      text: widget.content.shareText,
    );
  }

  Future<void> _saveToGallery() async {
    final file = await _captureCurrentCard();
    if (file == null) return;

    final success = await GallerySaveService.saveImageToGallery(
      file,
      title: 'Zenify_${widget.content.contentType}',
    );

    if (mounted) {
      if (success) {
        IslandNotifier.instance.show(
          IslandNotification(
            id: 'save_story_${DateTime.now().millisecondsSinceEpoch}',
            title: 'Saved to Gallery',
            body: 'Pictures/Zenify album',
            leading: const Icon(CupertinoIcons.checkmark_circle_fill, color: Color(0xFFE11D48), size: 18),
          ),
        );
      } else {
        appleToast(context, 'Could not save to gallery');
      }
    }
  }

  void _copyLink() {
    Clipboard.setData(ClipboardData(text: widget.content.shareUrl));
    HapticFeedback.lightImpact();
    IslandNotifier.instance.show(
      IslandNotification(
        id: 'copy_link_${DateTime.now().millisecondsSinceEpoch}',
        title: 'Copied Link',
        body: widget.content.title,
        leading: const Icon(CupertinoIcons.link, color: Color(0xFFE11D48), size: 18),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final safeTop = MediaQuery.paddingOf(context).top;
    final safeBottom = MediaQuery.paddingOf(context).bottom;

    return Scaffold(
      backgroundColor: const Color(0xFF121214), // Universal dark neutral
      body: SafeArea(
        top: false,
        bottom: false,
        child: Column(
          children: [
            // ── Top Bar ──
            Padding(
              padding: EdgeInsets.fromLTRB(16, safeTop + 8, 16, 8),
              child: Row(
                children: [
                  GestureDetector(
                    onTap: () => Navigator.of(context).pop(),
                    behavior: HitTestBehavior.opaque,
                    child: Container(
                      width: 36,
                      height: 36,
                      decoration: const ShapeDecoration(
                        shape: CircleBorder(),
                        color: Color(0x1FFFFFFF),
                      ),
                      child: const Icon(CupertinoIcons.xmark, size: 18, color: Colors.white),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Add to Story',
                          style: const TextStyle(
                            fontFamily: 'SF Pro Display',
                            fontSize: 17,
                            fontWeight: FontWeight.w700,
                            letterSpacing: -0.3,
                            color: Colors.white,
                          ),
                        ),
                        Text(
                          widget.content.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontFamily: 'SF Pro',
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                            color: Colors.white.withValues(alpha: 0.60),
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (_isExporting)
                    const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.2,
                        valueColor: AlwaysStoppedAnimation<Color>(Color(0xFFE11D48)),
                      ),
                    ),
                ],
              ),
            ),

            // ── Central Story Preview PageView ──
            Expanded(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: PageView.builder(
                    controller: _pageController,
                    physics: const BouncingScrollPhysics(),
                    itemCount: _availableTemplates.length,
                    onPageChanged: _onPageChanged,
                    itemBuilder: (context, index) {
                      final template = _availableTemplates[index];
                      return Center(
                        child: StoryCardPreview(
                          boundaryKey: template.id == _currentTemplate.id ? _boundaryKey : null,
                          content: widget.content,
                          template: template,
                          palette: _palette,
                          backgroundStyle: _backgroundStyle,
                          textPolarity: _textPolarity,
                          aspectRatio: _aspectRatio,
                        ),
                      );
                    },
                  ),
                ),
              ),
            ),

            const SizedBox(height: 8),

            // ── Horizontal Template Selector Bar ──
            StoryTemplateSelector(
              templates: _availableTemplates,
              selectedTemplate: _currentTemplate,
              onSelectTemplate: _onTemplateSelected,
            ),

            const SizedBox(height: 12),

            // ── Customization Toggles & Share Actions Bar ──
            Padding(
              padding: EdgeInsets.only(bottom: math.max(12, safeBottom + 6)),
              child: StoryShareControls(
                aspectRatio: _aspectRatio,
                backgroundStyle: _backgroundStyle,
                textPolarity: _textPolarity,
                onToggleAspectRatio: _toggleAspectRatio,
                onToggleBackgroundStyle: _toggleBackgroundStyle,
                onToggleTextPolarity: _toggleTextPolarity,
                onShareInstagram: _shareInstagram,
                onShareFacebook: _shareFacebook,
                onShareWhatsApp: _shareWhatsApp,
                onShareMore: _shareMore,
                onSaveGallery: _saveToGallery,
                onCopyLink: _copyLink,
                isExporting: _isExporting,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
