import 'dart:ui';

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';

import '../../services/dock_visibility.dart';
import 'apple_tokens.dart';

// ═══════════════════════════ SpringPressable ═══════════════════════════

/// Tap target with spring scale feedback + haptic. Debounces rapid taps.
class SpringPressable extends StatefulWidget {
  const SpringPressable({
    super.key,
    required this.child,
    this.onTap,
    this.onLongPress,
    this.onDoubleTap,
    this.pressedScale = 0.96,
    this.haptic = true,
    this.debounce = const Duration(milliseconds: 220),
  });

  final Widget child;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final VoidCallback? onDoubleTap;
  final double pressedScale;
  final bool haptic;
  final Duration debounce;

  @override
  State<SpringPressable> createState() => _SpringPressableState();
}

class _SpringPressableState extends State<SpringPressable> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController.unbounded(vsync: this, value: 1);
  DateTime _last = DateTime.fromMillisecondsSinceEpoch(0);

  bool get _enabled => widget.onTap != null || widget.onLongPress != null || widget.onDoubleTap != null;

  void _to(double v) {
    if (!mounted) return;
    _c.animateWith(SpringSimulation(AT.snappy, _c.value, v, _c.velocity));
  }

  void _tap() {
    final now = DateTime.now();
    if (now.difference(_last) < widget.debounce) return;
    _last = now;
    if (widget.haptic) HapticFeedback.selectionClick();
    widget.onTap?.call();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: _enabled ? (_) => _to(widget.pressedScale) : null,
      onTapUp: _enabled ? (_) => _to(1) : null,
      onTapCancel: _enabled ? () => _to(1) : null,
      onTap: widget.onTap == null ? null : _tap,
      onDoubleTap: widget.onDoubleTap,
      onLongPress: widget.onLongPress,
      child: AnimatedBuilder(
        animation: _c,
        builder: (_, child) => Transform.scale(scale: _c.value.clamp(0.6, 1.15), child: child),
        child: widget.child,
      ),
    );
  }
}

// ═══════════════════════════ Blur surface ═══════════════════════════

class AppleBlur extends StatelessWidget {
  const AppleBlur({
    super.key,
    required this.child,
    this.borderRadius = const BorderRadius.all(Radius.circular(AT.rLg)),
    this.tint = const Color(0x661C1C1E),
    this.sigma = 24,
    this.border = true,
  });

  final Widget child;
  final BorderRadius borderRadius;
  final Color tint;
  final double sigma;
  final bool border;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: borderRadius,
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: sigma, sigmaY: sigma),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: tint,
            borderRadius: borderRadius,
            border: border ? Border.all(color: AT.hairline, width: 0.5) : null,
          ),
          child: child,
        ),
      ),
    );
  }
}

// ═══════════════════════════ Pill button ═══════════════════════════

enum PillStyle { filled, tinted, glass, plain, destructive }

class PillButton extends StatelessWidget {
  const PillButton({
    super.key,
    required this.label,
    this.icon,
    this.onTap,
    this.style = PillStyle.filled,
    this.compact = false,
    this.expand = false,
    this.loading = false,
    this.color,
  });

  final String label;
  final IconData? icon;
  final VoidCallback? onTap;
  final PillStyle style;
  final bool compact;
  final bool expand;
  final bool loading;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final accent = color ?? AT.accent;
    late final Color bg;
    late final Color fg;
    switch (style) {
      case PillStyle.filled:
        bg = accent;
        fg = Colors.white;
      case PillStyle.tinted:
        bg = accent.withValues(alpha: 0.18);
        fg = accent;
      case PillStyle.glass:
        bg = AT.fillStrong;
        fg = AT.label;
      case PillStyle.plain:
        bg = Colors.transparent;
        fg = AT.label2;
      case PillStyle.destructive:
        bg = AT.red.withValues(alpha: 0.16);
        fg = AT.red;
    }
    final disabled = onTap == null || loading;
    final h = compact ? 36.0 : 50.0;

    final content = AnimatedSwitcher(
      duration: const Duration(milliseconds: 180),
      child: loading
          ? SizedBox(key: const ValueKey('l'), height: 18, width: 18, child: CupertinoActivityIndicator(color: fg))
          : Row(
              key: const ValueKey('c'),
              mainAxisSize: MainAxisSize.min,
              children: [
                if (icon != null) ...[Icon(icon, size: compact ? 16 : 19, color: fg), SizedBox(width: compact ? 6 : 8)],
                Flexible(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: fg, fontSize: compact ? 14 : 17, fontWeight: FontWeight.w600, letterSpacing: -0.3),
                  ),
                ),
              ],
            ),
    );

    return Opacity(
      opacity: onTap == null && !loading ? 0.4 : 1,
      child: SpringPressable(
        onTap: disabled ? null : onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          height: h,
          width: expand ? double.infinity : null,
          padding: EdgeInsets.symmetric(horizontal: compact ? 16 : 24),
          alignment: Alignment.center,
          decoration: ShapeDecoration(color: bg, shape: const StadiumBorder()),
          child: content,
        ),
      ),
    );
  }
}

/// Round glass icon button (nav bars, sheets).
class CircleIconButton extends StatelessWidget {
  const CircleIconButton({super.key, required this.icon, this.onTap, this.size = 40, this.iconSize = 19, this.color, this.filled = false, this.tooltip});
  final IconData icon;
  final VoidCallback? onTap;
  final double size;
  final double iconSize;
  final Color? color;
  final bool filled;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    final btn = SpringPressable(
      onTap: onTap,
      pressedScale: 0.9,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(shape: BoxShape.circle, color: filled ? (color ?? AT.accent) : AT.fillStrong),
        child: Icon(icon, size: iconSize, color: filled ? Colors.white : (color ?? AT.label)),
      ),
    );
    return tooltip == null ? btn : Tooltip(message: tooltip!, child: btn);
  }
}

// ═══════════════════════════ Pill tabs ═══════════════════════════

class PillTabs extends StatelessWidget {
  const PillTabs({super.key, required this.labels, required this.index, required this.onChanged, this.badges});
  final List<String> labels;
  final int index;
  final ValueChanged<int> onChanged;
  final List<int?>? badges;

  @override
  Widget build(BuildContext context) {
    final n = labels.length;
    return Container(
      height: 40,
      padding: const EdgeInsets.all(3),
      decoration: const ShapeDecoration(color: AT.fill, shape: StadiumBorder()),
      child: LayoutBuilder(builder: (context, c) {
        final w = c.maxWidth / n;
        return Stack(children: [
          AnimatedPositioned(
            duration: const Duration(milliseconds: 460),
            curve: SpringCurve(),
            left: index * w,
            width: w,
            top: 0,
            bottom: 0,
            child: const DecoratedBox(decoration: ShapeDecoration(color: Color(0x33FFFFFF), shape: StadiumBorder())),
          ),
          Row(
            children: List.generate(n, (i) {
              final sel = i == index;
              final b = badges != null && i < badges!.length ? badges![i] : null;
              return Expanded(
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () {
                    if (i == index) return;
                    HapticFeedback.selectionClick();
                    onChanged(i);
                  },
                  child: Center(
                    child: AnimatedDefaultTextStyle(
                      duration: const Duration(milliseconds: 200),
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, letterSpacing: -0.2, color: sel ? AT.label : AT.label2),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        Text(labels[i]),
                        if (b != null && b > 0) ...[
                          const SizedBox(width: 5),
                          Text('$b', style: TextStyle(fontSize: 12, color: sel ? AT.label2 : AT.label3)),
                        ],
                      ]),
                    ),
                  ),
                ),
              );
            }),
          ),
        ]);
      }),
    );
  }
}

// ═══════════════════════════ Sheets ═══════════════════════════

abstract final class AppleSheet {
  /// Physics-driven, drag-to-dismiss, keyboard-aware bottom sheet on a blurred material.
  static Future<T?> show<T>(
    BuildContext context, {
    required Widget Function(BuildContext context, ScrollController scroll) builder,
    double initial = 0.62,
    double max = 0.94,
  }) {
    HapticFeedback.selectionClick();
    return DockVisibility.runModal(
      () => showModalBottomSheet<T>(
        context: context,
        useRootNavigator: true,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        barrierColor: Colors.black54,
        useSafeArea: false,
        builder: (ctx) => _SheetBody(initial: initial, max: max, builder: builder),
      ),
    );
  }
}

class _SheetBody extends StatelessWidget {
  const _SheetBody({required this.initial, required this.max, required this.builder});
  final double initial;
  final double max;
  final Widget Function(BuildContext, ScrollController) builder;

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    return AnimatedPadding(
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOutCubic,
      padding: EdgeInsets.only(bottom: mq.viewInsets.bottom, top: mq.padding.top + 8),
      child: DraggableScrollableSheet(
        initialChildSize: initial,
        minChildSize: 0,
        maxChildSize: max,
        snap: true,
        snapSizes: [initial, max],
        expand: false,
        builder: (ctx, scroll) => AppleBlur(
          borderRadius: const BorderRadius.vertical(top: Radius.circular(AT.rXl)),
          tint: const Color(0xEB1C1C1E),
          sigma: 30,
          child: Column(children: [
            const SizedBox(height: 8),
            Container(width: 36, height: 5, decoration: BoxDecoration(color: AT.label3, borderRadius: BorderRadius.circular(3))),
            Expanded(child: builder(ctx, scroll)),
          ]),
        ),
      ),
    );
  }
}

/// Sheet title row.
class SheetHeader extends StatelessWidget {
  const SheetHeader({super.key, required this.title, this.subtitle, this.leading, this.trailing, this.onClose});
  final String title;
  final String? subtitle;
  final Widget? leading;
  final Widget? trailing;
  final VoidCallback? onClose;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 14, 16, 8),
      child: Row(children: [
        if (leading != null) ...[leading!, const SizedBox(width: 12)],
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(title, style: AT.title2, maxLines: 1, overflow: TextOverflow.ellipsis),
              if (subtitle != null && subtitle!.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(subtitle!, style: AT.footnote.copyWith(color: AT.label2), maxLines: 1, overflow: TextOverflow.ellipsis),
              ],
            ],
          ),
        ),
        ?trailing,
        if (onClose != null) CircleIconButton(icon: CupertinoIcons.xmark, size: 32, iconSize: 14, onTap: onClose),
      ]),
    );
  }
}

// ═══════════════════════════ Grouped list ═══════════════════════════

class GroupedSection extends StatelessWidget {
  const GroupedSection({super.key, this.title, this.footer, required this.children});
  final String? title;
  final String? footer;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (title != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Text(title!.toUpperCase(), style: AT.micro.copyWith(color: AT.label2)),
          ),
        ClipRRect(
          borderRadius: BorderRadius.circular(AT.rMd + 2),
          child: Container(
            color: AT.fill,
            child: Column(children: [
              for (var i = 0; i < children.length; i++) ...[
                children[i],
                if (i != children.length - 1) const Padding(padding: EdgeInsets.only(left: 16), child: Divider(height: 0.5, thickness: 0.5, color: AT.hairline)),
              ],
            ]),
          ),
        ),
        if (footer != null)
          Padding(padding: const EdgeInsets.fromLTRB(16, 8, 16, 0), child: Text(footer!, style: AT.caption)),
      ]),
    );
  }
}

class AppleRow extends StatelessWidget {
  const AppleRow({super.key, required this.title, this.subtitle, this.leading, this.trailing, this.onTap, this.destructive = false, this.chevron = false});
  final String title;
  final String? subtitle;
  final Widget? leading;
  final Widget? trailing;
  final VoidCallback? onTap;
  final bool destructive;
  final bool chevron;

  @override
  Widget build(BuildContext context) {
    final row = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(children: [
        if (leading != null) ...[leading!, const SizedBox(width: 12)],
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: AT.body.copyWith(color: destructive ? AT.red : AT.label, fontSize: 16)),
            if (subtitle != null) Padding(padding: const EdgeInsets.only(top: 2), child: Text(subtitle!, style: AT.footnote)),
          ]),
        ),
        if (trailing != null) ...[const SizedBox(width: 8), trailing!],
        if (chevron) const Padding(padding: EdgeInsets.only(left: 6), child: Icon(CupertinoIcons.chevron_right, size: 14, color: AT.label3)),
      ]),
    );
    if (onTap == null) return row;
    return SpringPressable(pressedScale: 0.985, onTap: onTap, child: row);
  }
}

class AppleSwitchRow extends StatelessWidget {
  const AppleSwitchRow({super.key, required this.title, this.subtitle, required this.value, required this.onChanged, this.leading});
  final String title;
  final String? subtitle;
  final bool value;
  final ValueChanged<bool>? onChanged;
  final Widget? leading;

  @override
  Widget build(BuildContext context) {
    return AppleRow(
      title: title,
      subtitle: subtitle,
      leading: leading,
      trailing: CupertinoSwitch(
        value: value,
        activeTrackColor: AT.green,
        onChanged: onChanged == null
            ? null
            : (v) {
                HapticFeedback.selectionClick();
                onChanged!(v);
              },
      ),
    );
  }
}

/// Rounded SF-symbol style icon tile for rows.
class IconTile extends StatelessWidget {
  const IconTile(this.icon, {super.key, this.color = AT.accent, this.size = 30});
  final IconData icon;
  final Color color;
  final double size;
  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(size * 0.28)),
        child: Icon(icon, size: size * 0.58, color: Colors.white),
      );
}

// ═══════════════════════════ Avatar ═══════════════════════════

class Avatar extends StatelessWidget {
  const Avatar({super.key, required this.name, this.size = 40, this.ring, this.dot});
  final String name;
  final double size;
  final Color? ring;
  final Color? dot;

  static const _palette = [Color(0xFFFF6482), Color(0xFFFF9F0A), Color(0xFF30D158), Color(0xFF64D2FF), Color(0xFFBF5AF2), Color(0xFF5E5CE6)];

  @override
  Widget build(BuildContext context) {
    final c = _palette[name.hashCode.abs() % _palette.length];
    final initial = name.trim().isEmpty ? '?' : name.trim()[0].toUpperCase();
    return SizedBox(
      width: size,
      height: size,
      child: Stack(clipBehavior: Clip.none, children: [
        AnimatedContainer(
          duration: const Duration(milliseconds: 220),
          width: size,
          height: size,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [c, c.withValues(alpha: 0.6)]),
            border: ring == null ? null : Border.all(color: ring!, width: 2),
          ),
          child: Text(initial, style: TextStyle(color: Colors.white, fontSize: size * 0.42, fontWeight: FontWeight.w700)),
        ),
        if (dot != null)
          Positioned(
            right: -1,
            bottom: -1,
            child: Container(width: size * 0.28, height: size * 0.28, decoration: BoxDecoration(color: dot, shape: BoxShape.circle, border: Border.all(color: AT.surface, width: 2))),
          ),
      ]),
    );
  }
}

// ═══════════════════════════ Ambient (artwork) background ═══════════════════════════

class ArtworkPalette {
  static final Map<String, List<Color>> _cache = {};
  static const List<Color> fallback = [Color(0xFF3A1C24), Color(0xFF12080B)];

  static Future<List<Color>> resolve(String url) async {
    if (url.isEmpty) return fallback;
    final hit = _cache[url];
    if (hit != null) return hit;
    try {
      // Tiny decode (64px) keeps this cheap. Cached per url, never run in build().
      final scheme = await ColorScheme.fromImageProvider(
        provider: ResizeImage(NetworkImage(url), width: 64, height: 64),
        brightness: Brightness.dark,
      );
      final out = [_tone(scheme.primary, 0.34), _tone(scheme.tertiary, 0.17)];
      if (_cache.length > 60) _cache.remove(_cache.keys.first);
      return _cache[url] = out;
    } catch (_) {
      return fallback;
    }
  }

  static Color _tone(Color c, double lightness) {
    final h = HSLColor.fromColor(c);
    return h.withLightness(lightness).withSaturation(h.saturation.clamp(0.25, 0.7)).toColor();
  }
}

/// Smoothly cross-fading ambient gradient driven by artwork. Keeps last palette while loading
/// so there is never a flash. Reduced-motion: swaps instantly.
class ArtworkAmbient extends StatefulWidget {
  const ArtworkAmbient({super.key, required this.url});
  final String url;
  @override
  State<ArtworkAmbient> createState() => _ArtworkAmbientState();
}

class _ArtworkAmbientState extends State<ArtworkAmbient> {
  List<Color> _colors = ArtworkPalette.fallback;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(ArtworkAmbient old) {
    super.didUpdateWidget(old);
    if (old.url != widget.url) _load();
  }

  Future<void> _load() async {
    final url = widget.url;
    final c = await ArtworkPalette.resolve(url);
    if (mounted && url == widget.url) setState(() => _colors = c);
  }

  @override
  Widget build(BuildContext context) {
    final reduce = MediaQuery.of(context).disableAnimations;
    return RepaintBoundary(
      child: AnimatedContainer(
        duration: reduce ? Duration.zero : const Duration(milliseconds: 1100),
        curve: Curves.easeInOut,
        decoration: BoxDecoration(
          gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [_colors[0], _colors[1], AT.bg], stops: const [0, 0.55, 1]),
        ),
      ),
    );
  }
}

// ═══════════════════════════ Toast ═══════════════════════════

void appleToast(BuildContext context, String message, {IconData? icon}) {
  final m = ScaffoldMessenger.maybeOf(context);
  if (m == null) return;
  m
    ..clearSnackBars()
    ..showSnackBar(SnackBar(
      behavior: SnackBarBehavior.floating,
      backgroundColor: AT.surfaceHi,
      elevation: 0,
      shape: const StadiumBorder(),
      margin: const EdgeInsets.fromLTRB(24, 0, 24, 24),
      duration: const Duration(milliseconds: 2200),
      content: Row(mainAxisSize: MainAxisSize.min, children: [
        if (icon != null) ...[Icon(icon, size: 18, color: AT.label), const SizedBox(width: 8)],
        Flexible(child: Text(message, style: AT.footnote.copyWith(color: AT.label), maxLines: 2, overflow: TextOverflow.ellipsis)),
      ]),
    ));
}
