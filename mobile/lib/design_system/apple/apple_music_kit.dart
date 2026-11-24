import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../services/dock_visibility.dart';
import '../../services/settings_service.dart';
import '../widgets/dynamic_island_header.dart';
import '../widgets/glass_surface.dart';
import '../widgets/zen_dropdown.dart';

export '../widgets/dynamic_island_header.dart' show DynamicIslandActionButton, IslandTitleFade;

// ═════════════════════════════════════════════════════════════════════════════
// TOKENS
// ═════════════════════════════════════════════════════════════════════════════
abstract final class AM {
  static const bg = Color(0xFF000000);
  static const card = Color(0xFF1C1C1E);
  static const cardHi = Color(0xFF2C2C2E);
  static const sep = Color(0xFF38383A);
  static const label = Colors.white;
  static const label2 = Color(0x99EBEBF5);
  static const label3 = Color(0x4DEBEBF5);

  /// The one accent used for every button, switch, slider and link.
  static const rose = Color(0xFFFA2D48);

  static const radius = 18.0;

  static const font = 'SF Pro';
  static const fontDisplay = 'SF Pro Display';

  static const navTitle = TextStyle(fontFamily: font, color: label, fontSize: 17, fontWeight: FontWeight.w600);
  static const rowTitle = TextStyle(fontFamily: font, color: label, fontSize: 17, fontWeight: FontWeight.w500, height: 1.2);
  static const sub = TextStyle(fontFamily: font, color: label2, fontSize: 13, height: 1.3);
  static const value = TextStyle(
    fontFamily: font,
    color: label2,
    fontSize: 15,
    fontFeatures: [FontFeature.tabularFigures()],
  );
  static const header = TextStyle(fontFamily: font, color: label2, fontSize: 13.5, letterSpacing: 0.3);
  static const footer = TextStyle(fontFamily: font, color: label2, fontSize: 13, height: 1.35);

  static bool get reduceMotion => SettingsState.instance.reduceMotion;
  static Duration dur(int ms) => reduceMotion ? Duration.zero : Duration(milliseconds: ms);

  static void tick() {
    if (SettingsState.instance.hapticsEnabled) HapticFeedback.selectionClick();
  }

  static void impact() {
    if (SettingsState.instance.hapticsEnabled) HapticFeedback.lightImpact();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PRESS FEEDBACK
// ═════════════════════════════════════════════════════════════════════════════

/// Spring-like press: shrinks on touch, overshoots slightly on release.
class AMTap extends StatefulWidget {
  const AMTap({super.key, required this.child, this.onTap, this.scale = 0.94});
  final Widget child;
  final VoidCallback? onTap;
  final double scale;

  @override
  State<AMTap> createState() => _AMTapState();
}

class _AMTapState extends State<AMTap> {
  bool _down = false;

  void _set(bool v) {
    if (_down != v && mounted) setState(() => _down = v);
  }

  @override
  Widget build(BuildContext context) {
    if (widget.onTap == null) return widget.child;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: (_) => _set(true),
      onTapUp: (_) => _set(false),
      onTapCancel: () => _set(false),
      onTap: widget.onTap,
      child: AnimatedScale(
        scale: _down && !AM.reduceMotion ? widget.scale : 1,
        duration: AM.dur(_down ? 110 : 280),
        curve: _down ? Curves.easeOutCubic : Curves.easeOutBack,
        child: widget.child,
      ),
    );
  }
}

class _Highlight extends StatefulWidget {
  const _Highlight({required this.child, this.onTap});
  final Widget child;
  final VoidCallback? onTap;

  @override
  State<_Highlight> createState() => _HighlightState();
}

class _HighlightState extends State<_Highlight> {
  bool _down = false;

  @override
  Widget build(BuildContext context) {
    if (widget.onTap == null) return widget.child;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: (_) => setState(() => _down = true),
      onTapUp: (_) => setState(() => _down = false),
      onTapCancel: () => setState(() => _down = false),
      onTap: widget.onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 90),
        color: _down ? AM.cardHi : Colors.transparent,
        child: widget.child,
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PAGE (circular glass back button, centred title, blur bar on scroll)
// ═════════════════════════════════════════════════════════════════════════════
class AMPage extends StatefulWidget {
  const AMPage({
    super.key,
    required this.title,
    required this.children,
    this.trailing,
    this.onBack,
  });

  final String title;
  final List<Widget> children;
  final Widget? trailing;
  final VoidCallback? onBack;

  @override
  State<AMPage> createState() => _AMPageState();
}

class _AMPageState extends State<AMPage> with HideDocksMixin<AMPage> {
  @override
  bool get hideMiniPlayerWhileActive => true;

  final _scroll = ScrollController();

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pad = MediaQuery.paddingOf(context);
    return Scaffold(
      backgroundColor: AM.bg,
      body: Stack(
        children: [
          ListView(
            controller: _scroll,
            physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
            padding: EdgeInsets.fromLTRB(16, pad.top + 58, 16, pad.bottom + 48),
            children: [
              for (var i = 0; i < widget.children.length; i++)
                AMReveal(index: i, child: widget.children[i]),
            ],
          ),
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: DynamicIslandHeader(
              title: widget.title,
              showBack: true,
              isDockPage: false,
              showProfile: false,
              alwaysShowTitle: true,
              scrollController: _scroll,
              onBack: widget.onBack ?? () => Navigator.of(context).maybePop(),
              trailing: widget.trailing,
            ),
          ),
        ],
      ),
    );
  }
}

/// Staggered fade + rise the first time a block is built. Kept alive so it
/// never replays while scrolling.
class AMReveal extends StatefulWidget {
  const AMReveal({super.key, required this.index, required this.child});
  final int index;
  final Widget child;

  @override
  State<AMReveal> createState() => _AMRevealState();
}

class _AMRevealState extends State<AMReveal>
    with SingleTickerProviderStateMixin, AutomaticKeepAliveClientMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 520));
  late final Animation<double> _a = CurvedAnimation(parent: _c, curve: Curves.easeOutCubic);

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    if (AM.reduceMotion) {
      _c.value = 1;
    } else {
      final delay = widget.index < 8 ? widget.index * 55 : 0;
      Future<void>.delayed(Duration(milliseconds: delay), () {
        if (mounted) _c.forward();
      });
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return FadeTransition(
      opacity: _a,
      child: SlideTransition(
        position: Tween<Offset>(begin: const Offset(0, 0.05), end: Offset.zero).animate(_a),
        child: widget.child,
      ),
    );
  }
}

class AMNavButton extends StatelessWidget {
  const AMNavButton({super.key, required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AMTap(
      onTap: () {
        AM.impact();
        onTap();
      },
      child: GlassSurface(
        borderRadius: BorderRadius.circular(22),
        child: SizedBox(
          width: 44,
          height: 44,
          child: Icon(icon, size: 20, color: Colors.white),
        ),
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTIONS & ROWS
// ═════════════════════════════════════════════════════════════════════════════
class _Hairline extends StatelessWidget {
  const _Hairline();
  @override
  Widget build(BuildContext context) =>
      Container(height: 0.5, margin: const EdgeInsets.only(left: 16), color: AM.sep);
}

/// Rounded dark card with inset dividers, a small header above and an
/// explanatory footer below. `bare` skips the card for custom content.
class AMSection extends StatelessWidget {
  const AMSection({
    super.key,
    this.header,
    this.footer,
    this.bare = false,
    required this.children,
  });

  final String? header;
  final String? footer;
  final bool bare;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final body = bare
        ? children
        : <Widget>[
            for (var i = 0; i < children.length; i++)
              if (i == 0)
                children[i]
              else if (children[i] is AMCollapse)
                (children[i] as AMCollapse).withDivider()
              else
                Column(mainAxisSize: MainAxisSize.min, children: [const _Hairline(), children[i]]),
          ];

    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (header != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Text(header!.toUpperCase(), style: AM.header),
            ),
          if (bare)
            Column(mainAxisSize: MainAxisSize.min, children: body)
          else
            ClipRRect(
              borderRadius: BorderRadius.circular(AM.radius),
              child: ColoredBox(
                color: AM.card,
                child: Column(mainAxisSize: MainAxisSize.min, children: body),
              ),
            ),
          if (footer != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Text(footer!, style: AM.footer),
            ),
        ],
      ),
    );
  }
}

/// Animates a row in and out (height + fade). Never use as the first child.
class AMCollapse extends StatelessWidget {
  const AMCollapse({super.key, required this.show, required this.child, this.divider = false});
  final bool show;
  final Widget child;
  final bool divider;

  AMCollapse withDivider() => AMCollapse(key: key, show: show, divider: true, child: child);

  @override
  Widget build(BuildContext context) {
    return AnimatedSize(
      duration: AM.dur(300),
      curve: Curves.easeOutCubic,
      alignment: Alignment.topCenter,
      child: show
          ? AnimatedOpacity(
              opacity: 1,
              duration: AM.dur(300),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [if (divider) const _Hairline(), child],
              ),
            )
          : const SizedBox(width: double.infinity),
    );
  }
}

class AMRow extends StatelessWidget {
  const AMRow({
    super.key,
    required this.title,
    this.subtitle,
    this.leading,
    this.value,
    this.trailing,
    this.chevron = false,
    this.onTap,
    this.titleColor,
  });

  final String title;
  final String? subtitle;
  final Widget? leading;
  final String? value;
  final Widget? trailing;
  final bool chevron;
  final VoidCallback? onTap;
  final Color? titleColor;

  @override
  Widget build(BuildContext context) {
    final row = Padding(
      padding: EdgeInsets.symmetric(horizontal: 16, vertical: subtitle == null ? 14 : 12),
      child: Row(
        children: [
          if (leading != null) ...[leading!, const SizedBox(width: 14)],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(title, style: AM.rowTitle.copyWith(color: titleColor ?? AM.label)),
                if (subtitle != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 3),
                    child: Text(subtitle!, style: AM.sub, maxLines: 2, overflow: TextOverflow.ellipsis),
                  ),
              ],
            ),
          ),
          if (value != null) ...[
            const SizedBox(width: 12),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 150),
              child: Text(value!, style: AM.value, maxLines: 1, overflow: TextOverflow.ellipsis),
            ),
          ],
          if (trailing != null) ...[const SizedBox(width: 10), trailing!],
          if (chevron) ...[
            const SizedBox(width: 8),
            const Icon(CupertinoIcons.chevron_forward, size: 15, color: AM.label3),
          ],
        ],
      ),
    );
    return _Highlight(
      onTap: onTap == null
          ? null
          : () {
              AM.tick();
              onTap!();
            },
      child: row,
    );
  }
}

class AMSwitchRow extends StatelessWidget {
  const AMSwitchRow({
    super.key,
    required this.title,
    this.subtitle,
    required this.value,
    required this.onChanged,
  });

  final String title;
  final String? subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: AM.rowTitle),
                if (subtitle != null)
                  Padding(padding: const EdgeInsets.only(top: 3), child: Text(subtitle!, style: AM.sub)),
              ],
            ),
          ),
          const SizedBox(width: 14),
          CupertinoSwitch(
            value: value,
            activeTrackColor: AM.rose,
            onChanged: (v) {
              AM.tick();
              onChanged(v);
            },
          ),
        ],
      ),
    );
  }
}

class AMSliderRow extends StatelessWidget {
  const AMSliderRow({
    super.key,
    required this.title,
    required this.valueLabel,
    required this.value,
    required this.onChanged,
    this.min = 0,
    this.max = 1,
    this.divisions,
    this.subtitle,
  });

  final String title;
  final String valueLabel;
  final double value;
  final ValueChanged<double> onChanged;
  final double min;
  final double max;
  final int? divisions;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 13, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(title, style: AM.rowTitle)),
              Text(valueLabel, style: AM.value),
            ],
          ),
          if (subtitle != null)
            Padding(padding: const EdgeInsets.only(top: 3), child: Text(subtitle!, style: AM.sub)),
          const SizedBox(height: 6),
          CupertinoSlider(
            value: value.clamp(min, max).toDouble(),
            min: min,
            max: max,
            divisions: divisions,
            activeColor: AM.rose,
            thumbColor: Colors.white,
            onChanged: onChanged,
            onChangeEnd: (_) => AM.tick(),
          ),
        ],
      ),
    );
  }
}

/// Segmented control with a springy rose thumb.
class AMSegmented<T> extends StatelessWidget {
  const AMSegmented({
    super.key,
    required this.options,
    required this.value,
    required this.onChanged,
    this.trackColor = AM.card,
  });

  final List<(T, String)> options;
  final T value;
  final ValueChanged<T> onChanged;
  final Color trackColor;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, box) {
        final w = (box.maxWidth - 4) / options.length;
        final idx = math.max(0, options.indexWhere((o) => o.$1 == value));
        return Container(
          height: 38,
          padding: const EdgeInsets.all(2),
          decoration: BoxDecoration(color: trackColor, borderRadius: BorderRadius.circular(11)),
          child: Stack(
            children: [
              AnimatedPositioned(
                duration: AM.dur(340),
                curve: Curves.easeOutBack,
                left: idx * w,
                top: 0,
                bottom: 0,
                width: w,
                child: DecoratedBox(
                  decoration: BoxDecoration(color: AM.rose, borderRadius: BorderRadius.circular(9)),
                ),
              ),
              Row(
                children: [
                  for (final o in options)
                    Expanded(
                      child: GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: () {
                          if (o.$1 == value) return;
                          AM.tick();
                          onChanged(o.$1);
                        },
                        child: Center(
                          child: AnimatedDefaultTextStyle(
                            duration: AM.dur(200),
                            style: TextStyle(
                              fontFamily: AM.font,
                              fontSize: 13.5,
                              fontWeight: FontWeight.w600,
                              color: o.$1 == value ? Colors.white : AM.label2,
                            ),
                            child: Text(o.$2),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }
}

class AMChip extends StatelessWidget {
  const AMChip({super.key, required this.label, required this.selected, required this.onTap, this.hint});
  final String label;
  final String? hint;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AMTap(
      onTap: () {
        AM.tick();
        onTap();
      },
      child: AnimatedContainer(
        duration: AM.dur(220),
        curve: Curves.easeOutCubic,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? AM.rose : AM.card,
          borderRadius: BorderRadius.circular(999),
        ),
        child: AnimatedSize(
          duration: AM.dur(200),
          curve: Curves.easeOutCubic,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (selected) ...[
                const Icon(CupertinoIcons.checkmark_alt, size: 15, color: Colors.white),
                const SizedBox(width: 6),
              ],
              Text(
                label,
                style: TextStyle(
                  fontFamily: AM.font,
                  color: selected ? Colors.white : AM.label,
                  fontSize: 15,
                  fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
                ),
              ),
              if (hint != null) ...[
                const SizedBox(width: 6),
                Text(
                  hint!,
                  style: TextStyle(
                    fontFamily: AM.font,
                    color: selected ? Colors.white.withValues(alpha: 0.85) : AM.label3,
                    fontSize: 12,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// SHEETS & PICKERS
// ═════════════════════════════════════════════════════════════════════════════
Future<T?> showAMSheet<T>(BuildContext context, WidgetBuilder builder) {
  AM.impact();
  return DockVisibility.runModal(
    () => showModalBottomSheet<T>(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withValues(alpha: 0.6),
      sheetAnimationStyle: AnimationStyle(
        duration: const Duration(milliseconds: 460),
        curve: Curves.easeOutQuart,
        reverseDuration: const Duration(milliseconds: 280),
        reverseCurve: Curves.easeInCubic,
      ),
      builder: builder,
    ),
  );
}

/// Apple Music style sheet: grabber, Cancel / title / action, scrollable body.
class AMSheetFrame extends StatefulWidget {
  const AMSheetFrame({
    super.key,
    required this.title,
    required this.body,
    this.subtitle,
    this.leadingLabel,
    this.actionLabel = 'Done',
    this.onAction,
    this.actionEnabled = true,
    this.actionLoading = false,
    this.heightFactor = 0.78,
  });

  final String title;
  final String? subtitle;
  final Widget body;
  final String? leadingLabel;
  final String actionLabel;
  final VoidCallback? onAction;
  final bool actionEnabled;
  final bool actionLoading;
  final double heightFactor;

  @override
  State<AMSheetFrame> createState() => _AMSheetFrameState();
}

class _AMSheetFrameState extends State<AMSheetFrame> with HideDocksMixin {
  @override
  bool get hideMiniPlayerWhileActive => true;

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final inset = media.viewInsets.bottom;
    final h = ((media.size.height - inset) * widget.heightFactor).clamp(320.0, 780.0);
    void close() => Navigator.of(context, rootNavigator: true).pop();

    return AnimatedPadding(
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOutCubic,
      padding: EdgeInsets.only(bottom: inset),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 25, sigmaY: 25),
        child: Material(
          color: Colors.transparent,
          child: Container(
            height: h,
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              color: const Color(0xF21C1C1E),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(30)),
              border: Border(
                top: BorderSide(
                  color: Colors.white.withValues(alpha: 0.12),
                  width: 0.6,
                ),
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.5),
                  blurRadius: 36,
                  offset: const Offset(0, -6),
                ),
              ],
            ),
            child: Column(
              children: [
                const SizedBox(height: 10),
                Container(
                  width: 36,
                  height: 4.5,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.22),
                    borderRadius: BorderRadius.circular(2.5),
                  ),
                ),
                SizedBox(
                  height: 52,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      if (widget.leadingLabel != null)
                        Align(
                          alignment: Alignment.centerLeft,
                          child: CupertinoButton(
                            padding: const EdgeInsets.symmetric(horizontal: 18),
                            onPressed: close,
                            child: Text(
                              widget.leadingLabel!,
                              style: const TextStyle(
                                fontFamily: AM.font,
                                color: AM.rose,
                                fontSize: 17,
                              ),
                            ),
                          ),
                        ),
                      Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(widget.title, style: AM.navTitle),
                          if (widget.subtitle != null)
                            Text(widget.subtitle!, style: AM.sub.copyWith(fontSize: 12)),
                        ],
                      ),
                      Align(
                        alignment: Alignment.centerRight,
                        child: widget.actionLoading
                            ? const Padding(
                                padding: EdgeInsets.only(right: 20),
                                child: CupertinoActivityIndicator(),
                              )
                            : CupertinoButton(
                                padding: const EdgeInsets.symmetric(horizontal: 18),
                                onPressed: widget.actionEnabled ? (widget.onAction ?? close) : null,
                                child: Text(
                                  widget.actionLabel,
                                  style: TextStyle(
                                    fontFamily: AM.font,
                                    color: widget.actionEnabled ? AM.rose : AM.label3,
                                    fontSize: 17,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                      ),
                    ],
                  ),
                ),
                const Divider(
                  height: 0.5,
                  thickness: 0.5,
                  color: Color(0xFF38383A),
                ),
                Expanded(child: widget.body),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Read-only list of facts in a sheet (diagnostics, update status…).
Future<void> showAMInfo(
  BuildContext context, {
  required String title,
  String? subtitle,
  required Map<String, String> rows,
}) {
  return showAMSheet<void>(
    context,
    (_) => AMSheetFrame(
      title: title,
      subtitle: subtitle,
      heightFactor: 0.5,
      body: ListView(
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          AMSection(
            children: [for (final e in rows.entries) AMRow(title: e.key, value: e.value)],
          ),
        ],
      ),
    ),
  );
}

/// Unified liquid-glass dropdown sheet for choosing one value across all pages.
Future<T?> showAMOptions<T>(
  BuildContext context, {
  required String title,
  String? message,
  required List<(T, String)> options,
  required T current,
}) async {
  T? selected;
  await ZenDropdown.show(
    context: context,
    title: title,
    subtitle: message,
    items: [
      for (final o in options)
        ZenDropdownItem(
          title: o.$2,
          icon: o.$1 == current
              ? CupertinoIcons.checkmark_alt
              : CupertinoIcons.circle,
          isSelected: o.$1 == current,
          onTap: () {
            selected = o.$1;
          },
        ),
    ],
  );
  return selected;
}
