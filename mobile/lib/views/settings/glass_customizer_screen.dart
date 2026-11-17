import 'dart:math' as math;
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../design_system/apple/apple_kit.dart';
import '../../design_system/widgets/apple_glass.dart';
import '../../services/settings_service.dart';

class GlassCustomizerScreen extends StatefulWidget {
  const GlassCustomizerScreen({super.key});

  @override
  State<GlassCustomizerScreen> createState() => _GlassCustomizerScreenState();
}

class _GlassCustomizerScreenState extends State<GlassCustomizerScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _eqController;
  bool _previewVibrantBg = true;
  bool _demoLiked = true;

  @override
  void initState() {
    super.initState();
    _eqController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat();
  }

  @override
  void dispose() {
    _eqController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: SettingsState.instance,
      builder: (context, _) {
        final settings = SettingsState.instance;
        final fluidityPercent = (settings.glassFluidity * 100).round();

        return Scaffold(
          backgroundColor: const Color(0xFF0C0C0E),
          appBar: CupertinoNavigationBar(
            backgroundColor: const Color(0xCC0C0C0E),
            border: const Border(bottom: BorderSide(color: Color(0x1FFFFFFF), width: 0.5)),
            leading: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () {
                HapticFeedback.lightImpact();
                Navigator.of(context).maybePop();
              },
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(CupertinoIcons.chevron_back, color: Color(0xFFFA2D48), size: 24),
                  SizedBox(width: 2),
                  Text('Settings', style: TextStyle(color: Color(0xFFFA2D48), fontSize: 16)),
                ],
              ),
            ),
            middle: const Text(
              'Glass & Surface Styling',
              style: TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w600),
            ),
            trailing: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () {
                HapticFeedback.mediumImpact();
                settings.resetGlassToDefault();
                appleToast(context, 'Reset to 100% Liquid Glass', icon: CupertinoIcons.arrow_counterclockwise);
              },
              child: const Text(
                'Reset',
                style: TextStyle(color: Color(0xFFFA2D48), fontSize: 15, fontWeight: FontWeight.w500),
              ),
            ),
          ),
          body: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
            physics: const BouncingScrollPhysics(),
            children: [
              // 1. LIVE INTERACTIVE DEMO PREVIEW
              _buildLivePreviewBox(settings),

              const SizedBox(height: 24),

              // 2. QUICK STYLE PRESETS
              const _SectionHeader(
                title: 'STYLE PRESETS',
                subtitle: 'Tap to instantly switch dock, mini player & island material',
              ),
              const SizedBox(height: 10),
              _buildPresetsGrid(settings),

              const SizedBox(height: 24),

              // 3. FLUIDITY & OPACITY CONTROLLER
              _SectionHeader(
                title: 'FLUIDITY & TRANSPARENCY',
                badge: '$fluidityPercent% FLUID',
              ),
              const SizedBox(height: 8),
              _buildFluiditySliderCard(settings),

              const SizedBox(height: 24),

              // 4. BASE COLOR PALETTE
              const _SectionHeader(
                title: 'BASE MATERIAL SHADE',
                subtitle: 'Underlying tint when rendered in low fluid or solid mode',
              ),
              const SizedBox(height: 10),
              _buildBaseColorRow(settings),

              const SizedBox(height: 24),

              // 5. BLUR & SPECULAR EDGES
              const _SectionHeader(
                title: 'SURFACE REACTION & EDGES',
              ),
              const SizedBox(height: 10),
              _buildSurfaceReactionCard(settings),

              const SizedBox(height: 32),

              // 6. BOTTOM RESET BUTTON
              Center(
                child: CupertinoButton(
                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                  color: Colors.white.withValues(alpha: 0.06),
                  borderRadius: BorderRadius.circular(14),
                  onPressed: () {
                    HapticFeedback.mediumImpact();
                    settings.resetGlassToDefault();
                    appleToast(context, 'Reset to Apple Liquid Glass Default', icon: CupertinoIcons.sparkles);
                  },
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(CupertinoIcons.sparkles, color: Color(0xFFFA2D48), size: 18),
                      SizedBox(width: 8),
                      Text(
                        'Reset to Apple Liquid Glass Default',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  // ===========================================================================
  // LIVE PREVIEW CONTAINER
  // ===========================================================================
  Widget _buildLivePreviewBox(SettingsState settings) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: Colors.white.withValues(alpha: 0.12), width: 0.8),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.40),
            blurRadius: 18,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(22),
        child: Stack(
          children: [
            // Background Canvas
            Positioned.fill(
              child: AnimatedCrossFade(
                duration: const Duration(milliseconds: 300),
                crossFadeState: _previewVibrantBg ? CrossFadeState.showFirst : CrossFadeState.showSecond,
                firstChild: _buildVibrantBackdrop(),
                secondChild: Container(color: const Color(0xFF141418)),
              ),
            ),

            // Content inside preview
            Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                // Header with Badge + Toggle
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: const Color(0xFFE11D48).withValues(alpha: 0.20),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: const Color(0xFFE11D48).withValues(alpha: 0.40), width: 0.8),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(CupertinoIcons.sparkles, color: Color(0xFFE11D48), size: 11),
                          SizedBox(width: 4),
                          Text(
                            'LIVE INTERACTIVE DEMO',
                            style: TextStyle(
                              color: Color(0xFFE11D48),
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 0.8,
                            ),
                          ),
                        ],
                      ),
                    ),
                    GestureDetector(
                      onTap: () {
                        HapticFeedback.selectionClick();
                        setState(() => _previewVibrantBg = !_previewVibrantBg);
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.40),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.white.withValues(alpha: 0.15), width: 0.6),
                        ),
                        child: Text(
                          _previewVibrantBg ? 'Artwork Backdrop' : 'Studio Dark',
                          style: const TextStyle(color: Colors.white70, fontSize: 10, fontWeight: FontWeight.w600),
                        ),
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 14),

                // 1. DYNAMIC ISLAND PREVIEW
                _buildDemoDynamicIsland(),

                const SizedBox(height: 14),

                // 2. MINIPLAYER PREVIEW
                _buildDemoMiniPlayer(),

                const SizedBox(height: 14),

                // 3. FULLSCREEN PLAYER GLASS BUTTONS
                _buildDemoPlayerGlassButtons(),

                const SizedBox(height: 14),

                // 4. APPLE DOCK PREVIEW
                _buildDemoAppleDock(),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

  Widget _buildVibrantBackdrop() {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF500724), // deep wine red
            Color(0xFF831843), // crimson
            Color(0xFF312E81), // indigo
            Color(0xFF1E1B4B), // dark night
          ],
        ),
      ),
      child: Stack(
        children: [
          // Blurred color orbs to test glass refraction
          Positioned(
            left: 20,
            top: 40,
            child: Container(
              width: 140,
              height: 140,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFFE11D48).withValues(alpha: 0.45),
              ),
            ),
          ),
          Positioned(
            right: 10,
            bottom: 20,
            child: Container(
              width: 130,
              height: 130,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFF38BDF8).withValues(alpha: 0.35),
              ),
            ),
          ),
          // Subtle background decorative text
          Positioned(
            left: 30,
            top: 90,
            child: Text(
              'JAILER · HUKUM',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.15),
                fontSize: 26,
                fontWeight: FontWeight.w900,
                letterSpacing: 2,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // Dynamic Island Mockup
  Widget _buildDemoDynamicIsland() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        // Back Button
        AppleGlass(
          borderRadius: BorderRadius.circular(18),
          child: const SizedBox(
            width: 36,
            height: 36,
            child: Center(
              child: Icon(CupertinoIcons.chevron_back, color: Colors.white, size: 18),
            ),
          ),
        ),

        // Center Dynamic Island
        AppleGlass(
          borderRadius: BorderRadius.circular(20),
          child: Container(
            height: 36,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Animated Equalizer waveform
                AnimatedBuilder(
                  animation: _eqController,
                  builder: (_, _) {
                    return Row(
                      mainAxisSize: MainAxisSize.min,
                      children: List.generate(3, (i) {
                        final val = (math.sin(_eqController.value * 2 * math.pi + i * 1.5) + 1) / 2;
                        final barH = 5.0 + val * 9.0;
                        return Container(
                          width: 2.2,
                          height: barH,
                          margin: const EdgeInsets.symmetric(horizontal: 1),
                          decoration: BoxDecoration(
                            color: const Color(0xFFE11D48),
                            borderRadius: BorderRadius.circular(2),
                          ),
                        );
                      }),
                    );
                  },
                ),
                const SizedBox(width: 8),
                const Text(
                  'Hukum · Anirudh',
                  style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700),
                ),
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: const Text(
                    'LOSSLESS',
                    style: TextStyle(color: Colors.white70, fontSize: 8, fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ),
          ),
        ),

        // More Action Button
        AppleGlass(
          borderRadius: BorderRadius.circular(18),
          child: const SizedBox(
            width: 36,
            height: 36,
            child: Center(
              child: Icon(CupertinoIcons.ellipsis, color: Colors.white, size: 18),
            ),
          ),
        ),
      ],
    );
  }

  // MiniPlayer Mockup
  Widget _buildDemoMiniPlayer() {
    return AppleGlass(
      borderRadius: BorderRadius.circular(16),
      child: Container(
        height: 52,
        padding: const EdgeInsets.symmetric(horizontal: 8),
        child: Row(
          children: [
            // Artwork thumb
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Container(
                width: 36,
                height: 36,
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    colors: [Color(0xFF9E2339), Color(0xFFE11D48)],
                  ),
                ),
                child: const Center(
                  child: Icon(CupertinoIcons.music_note, color: Colors.white, size: 18),
                ),
              ),
            ),
            const SizedBox(width: 10),

            // Song & Artist Info
            const Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Hukum - Thalaivar Alappara',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w700),
                  ),
                  SizedBox(height: 2),
                  Text(
                    'Jailer · Anirudh Ravichander',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: Colors.white60, fontSize: 11, fontWeight: FontWeight.w500),
                  ),
                ],
              ),
            ),

            // Controls
            const Icon(CupertinoIcons.pause_fill, color: Colors.white, size: 20),
            const SizedBox(width: 14),
            const Icon(CupertinoIcons.forward_fill, color: Colors.white70, size: 18),
            const SizedBox(width: 6),
          ],
        ),
      ),
    );
  }

  // Fullscreen Player Glass Buttons Mockup (Heart, Three-Dot, Share, Lyrics)
  Widget _buildDemoPlayerGlassButtons() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        // Heart Button
        GestureDetector(
          onTap: () {
            HapticFeedback.selectionClick();
            setState(() => _demoLiked = !_demoLiked);
          },
          child: AppleGlass(
            borderRadius: BorderRadius.circular(18),
            child: SizedBox(
              width: 36,
              height: 36,
              child: Center(
                child: Icon(
                  _demoLiked ? CupertinoIcons.star_fill : CupertinoIcons.star,
                  color: _demoLiked ? const Color(0xFFFA2D48) : Colors.white,
                  size: 18,
                ),
              ),
            ),
          ),
        ),

        // Three-Dot More Button
        AppleGlass(
          borderRadius: BorderRadius.circular(18),
          child: const SizedBox(
            width: 36,
            height: 36,
            child: Center(
              child: Icon(
                CupertinoIcons.ellipsis_vertical,
                color: Colors.white,
                size: 18,
              ),
            ),
          ),
        ),

        // Share Glass Button
        AppleGlass(
          borderRadius: BorderRadius.circular(18),
          child: const SizedBox(
            width: 36,
            height: 36,
            child: Center(
              child: Icon(
                CupertinoIcons.share,
                color: Colors.white,
                size: 17,
              ),
            ),
          ),
        ),

        // Lyrics Glass Pill
        AppleGlass(
          borderRadius: BorderRadius.circular(18),
          child: Container(
            height: 36,
            padding: const EdgeInsets.symmetric(horizontal: 10),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(CupertinoIcons.quote_bubble, color: Colors.white, size: 16),
                SizedBox(width: 4),
                Text(
                  'Lyrics',
                  style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  // AppleDock Mockup
  Widget _buildDemoAppleDock() {
    return Row(
      children: [
        // Main Dock Pill
        Expanded(
          child: AppleGlass(
            borderRadius: BorderRadius.circular(24),
            child: Container(
              height: 48,
              padding: const EdgeInsets.symmetric(horizontal: 10),
              child: const Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  _DemoDockTab(icon: CupertinoIcons.house_fill, label: 'Home', isSelected: true),
                  _DemoDockTab(icon: CupertinoIcons.square_grid_2x2_fill, label: 'Explore', isSelected: false),
                  _DemoDockTab(icon: CupertinoIcons.music_albums_fill, label: 'Library', isSelected: false),
                ],
              ),
            ),
          ),
        ),

        const SizedBox(width: 10),

        // Round Search Circle
        AppleGlass(
          borderRadius: BorderRadius.circular(24),
          child: const SizedBox(
            width: 48,
            height: 48,
            child: Center(
              child: Icon(CupertinoIcons.search, color: Colors.white, size: 20),
            ),
          ),
        ),
      ],
    );
  }

  // ===========================================================================
  // PRESETS GRID
  // ===========================================================================
  Widget _buildPresetsGrid(SettingsState settings) {
    final curStyle = settings.glassStyle;

    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: _PresetCard(
                title: 'Liquid Glass',
                subtitle: '100% Fluidity · Specular Rim',
                icon: CupertinoIcons.sparkles,
                isSelected: curStyle == 'fluid',
                onTap: () {
                  HapticFeedback.selectionClick();
                  settings.setGlassStyle('fluid');
                },
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _PresetCard(
                title: 'Slight Glass',
                subtitle: '50% Fluidity · Soft Frosted',
                icon: CupertinoIcons.drop,
                isSelected: curStyle == 'frosted',
                onTap: () {
                  HapticFeedback.selectionClick();
                  settings.setGlassStyle('frosted');
                },
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: _PresetCard(
                title: 'Neutral Grey',
                subtitle: '0% Fluid · Sleek Matte Charcoal',
                icon: CupertinoIcons.square_fill,
                isSelected: curStyle == 'grey',
                onTap: () {
                  HapticFeedback.selectionClick();
                  settings.setGlassStyle('grey');
                },
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _PresetCard(
                title: 'Pure Black',
                subtitle: '0% Fluid · Deep OLED Black',
                icon: CupertinoIcons.moon_fill,
                isSelected: curStyle == 'black',
                onTap: () {
                  HapticFeedback.selectionClick();
                  settings.setGlassStyle('black');
                },
              ),
            ),
          ],
        ),
      ],
    );
  }

  // ===========================================================================
  // FLUIDITY SLIDER CARD
  // ===========================================================================
  Widget _buildFluiditySliderCard(SettingsState settings) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: const Color(0xFF141418),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08), width: 0.6),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Fluidity Range',
                style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w600),
              ),
              Text(
                '${(settings.glassFluidity * 100).round()}%',
                style: const TextStyle(
                  color: Color(0xFFE11D48),
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          const Text(
            'Slide from 0% (solid matte) to 100% (liquid clear glass)',
            style: TextStyle(color: Colors.white54, fontSize: 12),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              const Icon(CupertinoIcons.square_fill, color: Colors.white38, size: 16),
              Expanded(
                child: CupertinoSlider(
                  value: settings.glassFluidity,
                  min: 0.0,
                  max: 1.0,
                  activeColor: const Color(0xFFE11D48),
                  thumbColor: Colors.white,
                  onChanged: (val) {
                    settings.setGlassFluidity(val);
                  },
                ),
              ),
              const Icon(CupertinoIcons.sparkles, color: Color(0xFFE11D48), size: 16),
            ],
          ),
        ],
      ),
    );
  }

  // ===========================================================================
  // BASE COLOR SHADE
  // ===========================================================================
  Widget _buildBaseColorRow(SettingsState settings) {
    final curBase = settings.glassBaseColor;

    final swatches = [
      ('default', 'Default Dark', const Color(0xFF121216)),
      ('black', 'Pure Black', const Color(0xFF0C0C0E)),
      ('grey', 'Neutral Grey', const Color(0xFF222226)),
      ('crimson', 'Crimson Wine', const Color(0xFF1E0A12)),
    ];

    return Row(
      children: swatches.map((item) {
        final (key, label, color) = item;
        final isSelected = curBase == key;

        return Expanded(
          child: GestureDetector(
            onTap: () {
              HapticFeedback.selectionClick();
              settings.setGlassBaseColor(key);
            },
            child: Container(
              margin: const EdgeInsets.symmetric(horizontal: 3),
              padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
              decoration: BoxDecoration(
                color: const Color(0xFF141418),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: isSelected ? const Color(0xFFE11D48) : Colors.white.withValues(alpha: 0.08),
                  width: isSelected ? 1.5 : 0.6,
                ),
              ),
              child: Column(
                children: [
                  Container(
                    width: 24,
                    height: 24,
                    decoration: BoxDecoration(
                      color: color,
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white24, width: 0.8),
                    ),
                    child: isSelected
                        ? const Center(
                            child: Icon(CupertinoIcons.checkmark, size: 13, color: Color(0xFFE11D48)),
                          )
                        : null,
                  ),
                  const SizedBox(height: 6),
                  Text(
                    label,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: isSelected ? Colors.white : Colors.white60,
                      fontSize: 10,
                      fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  // ===========================================================================
  // BLUR & SPECULAR EDGES
  // ===========================================================================
  Widget _buildSurfaceReactionCard(SettingsState settings) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF141418),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08), width: 0.6),
      ),
      child: Column(
        children: [
          // Blur Slider Row
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'Blur Intensity',
                      style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w600),
                    ),
                    Text(
                      '${settings.glassBlur.round()} px',
                      style: const TextStyle(
                        color: Color(0xFFE11D48),
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                const Text(
                  'Diffusion level behind the glass surface (lower is clearer)',
                  style: TextStyle(color: Colors.white54, fontSize: 12),
                ),
                const SizedBox(height: 8),
                CupertinoSlider(
                  value: settings.glassBlur,
                  min: 0.0,
                  max: 20.0,
                  activeColor: const Color(0xFFE11D48),
                  thumbColor: Colors.white,
                  onChanged: (val) {
                    settings.setGlassBlur(val);
                  },
                ),
              ],
            ),
          ),

          Divider(height: 1, color: Colors.white.withValues(alpha: 0.08)),

          // Specular Edge Reflection Switch
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Specular Edge Reflection',
                        style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w600),
                      ),
                      SizedBox(height: 2),
                      Text(
                        'Luminescent light refraction along glass edges',
                        style: TextStyle(color: Colors.white54, fontSize: 12),
                      ),
                    ],
                  ),
                ),
                CupertinoSwitch(
                  value: settings.glassSpecularRim,
                  activeTrackColor: const Color(0xFFE11D48),
                  onChanged: (val) {
                    HapticFeedback.selectionClick();
                    settings.setGlassSpecularRim(val);
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// HELPER SUB-WIDGETS
// =============================================================================

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({
    required this.title,
    this.subtitle,
    this.badge,
  });

  final String title;
  final String? subtitle;
  final String? badge;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              title,
              style: const TextStyle(
                color: Color(0xFF8E8E93),
                fontSize: 12,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.8,
              ),
            ),
            if (badge != null)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: const Color(0xFFE11D48).withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  badge!,
                  style: const TextStyle(
                    color: Color(0xFFE11D48),
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
          ],
        ),
        if (subtitle != null) ...[
          const SizedBox(height: 3),
          Text(
            subtitle!,
            style: const TextStyle(color: Colors.white54, fontSize: 12),
          ),
        ],
      ],
    );
  }
}

class _PresetCard extends StatelessWidget {
  const _PresetCard({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.isSelected,
    required this.onTap,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isSelected
              ? const Color(0xFFE11D48).withValues(alpha: 0.12)
              : const Color(0xFF141418),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: isSelected
                ? const Color(0xFFE11D48)
                : Colors.white.withValues(alpha: 0.08),
            width: isSelected ? 1.5 : 0.6,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Icon(
                  icon,
                  size: 20,
                  color: isSelected ? const Color(0xFFE11D48) : Colors.white70,
                ),
                if (isSelected)
                  const Icon(
                    CupertinoIcons.checkmark_circle_fill,
                    size: 16,
                    color: Color(0xFFE11D48),
                  ),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              title,
              style: TextStyle(
                color: isSelected ? Colors.white : Colors.white.withValues(alpha: 0.85),
                fontSize: 14,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 3),
            Text(
              subtitle,
              style: TextStyle(
                color: isSelected ? Colors.white70 : Colors.white38,
                fontSize: 11,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DemoDockTab extends StatelessWidget {
  const _DemoDockTab({
    required this.icon,
    required this.label,
    required this.isSelected,
  });

  final IconData icon;
  final String label;
  final bool isSelected;

  @override
  Widget build(BuildContext context) {
    final color = isSelected ? const Color(0xFFFA2D48) : const Color(0xFF8E8E93);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 20, color: color),
        const SizedBox(height: 2),
        Text(
          label,
          style: TextStyle(
            color: color,
            fontSize: 10,
            fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
          ),
        ),
      ],
    );
  }
}
