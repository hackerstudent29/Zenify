import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../tokens/app_colors.dart';

/* ------------------------------------------------------------------ */
/*  Squishy Spring Press Effect                                       */
/* ------------------------------------------------------------------ */

class _ButtonPress extends StatefulWidget {
  const _ButtonPress({required this.child, this.onTap, this.scale = 0.95});
  final Widget child;
  final VoidCallback? onTap;
  final double scale;

  @override
  State<_ButtonPress> createState() => _ButtonPressState();
}

class _ButtonPressState extends State<_ButtonPress> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 140),
    lowerBound: 0.0,
    upperBound: 1.0,
  );

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: (_) {
        if (widget.onTap != null) _c.animateTo(1.0, curve: Curves.easeOut);
      },
      onTapUp: (_) {
        if (widget.onTap != null) _c.animateBack(0.0, curve: Curves.elasticOut);
      },
      onTapCancel: () => _c.animateBack(0.0, curve: Curves.easeOut),
      onTap: widget.onTap == null
          ? null
          : () {
              HapticFeedback.lightImpact();
              widget.onTap!();
            },
      child: AnimatedBuilder(
        animation: _c,
        child: widget.child,
        builder: (_, child) => Transform.scale(
          scale: 1.0 - (1.0 - widget.scale) * _c.value,
          child: child,
        ),
      ),
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Canonical Apple Music Play / Pause Pill Button                    */
/* ------------------------------------------------------------------ */

class ZenPlayButton extends StatelessWidget {
  const ZenPlayButton({
    super.key,
    required this.onTap,
    this.isPlaying = false,
    this.label,
    this.height = 50.0,
    this.expanded = false,
    this.isSecondary = false,
    this.fontSize = 17.0,
    this.iconSize = 20.0,
  });

  final VoidCallback onTap;
  final bool isPlaying;
  final String? label;
  final double height;
  final bool expanded;
  final bool isSecondary;
  final double fontSize;
  final double iconSize;

  @override
  Widget build(BuildContext context) {
    final displayText = label ?? (isPlaying ? 'Pause' : 'Play');
    final radius = height / 2;

    final content = Container(
      height: height,
      padding: const EdgeInsets.symmetric(horizontal: 22),
      decoration: BoxDecoration(
        color: isSecondary ? Colors.white.withValues(alpha: 0.14) : Colors.white,
        borderRadius: BorderRadius.circular(radius),
      ),
      alignment: Alignment.center,
      child: Row(
        mainAxisSize: expanded ? MainAxisSize.max : MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            isPlaying ? CupertinoIcons.pause_fill : CupertinoIcons.play_fill,
            color: isSecondary ? Colors.white : Colors.black,
            size: iconSize,
          ),
          const SizedBox(width: 8),
          Text(
            displayText,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontFamily: 'SF Pro',
              color: isSecondary ? Colors.white : Colors.black,
              fontSize: fontSize,
              fontWeight: FontWeight.w600,
              letterSpacing: -0.3,
            ),
          ),
        ],
      ),
    );

    return _ButtonPress(
      onTap: onTap,
      scale: 0.95,
      child: expanded ? SizedBox(width: double.infinity, child: content) : content,
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Canonical Shuffle Pill Button (Matching Rounded Stadium Shape)     */
/* ------------------------------------------------------------------ */

class ZenShuffleButton extends StatelessWidget {
  const ZenShuffleButton({
    super.key,
    required this.onTap,
    this.label = 'Shuffle',
    this.height = 50.0,
    this.expanded = false,
    this.fontSize = 17.0,
    this.iconSize = 20.0,
  });

  final VoidCallback onTap;
  final String label;
  final double height;
  final bool expanded;
  final double fontSize;
  final double iconSize;

  @override
  Widget build(BuildContext context) {
    final radius = height / 2;

    final content = Container(
      height: height,
      padding: const EdgeInsets.symmetric(horizontal: 20),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(radius),
      ),
      alignment: Alignment.center,
      child: Row(
        mainAxisSize: expanded ? MainAxisSize.max : MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            CupertinoIcons.shuffle,
            color: Colors.white,
            size: iconSize,
          ),
          const SizedBox(width: 8),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontFamily: 'SF Pro',
              color: Colors.white,
              fontSize: fontSize,
              fontWeight: FontWeight.w600,
              letterSpacing: -0.3,
            ),
          ),
        ],
      ),
    );

    return _ButtonPress(
      onTap: onTap,
      scale: 0.95,
      child: expanded ? SizedBox(width: double.infinity, child: content) : content,
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Canonical Icon-Only Button: Strictly Circular Round Shape         */
/* ------------------------------------------------------------------ */

class ZenActionCircle extends StatelessWidget {
  const ZenActionCircle({
    super.key,
    required this.icon,
    required this.onTap,
    this.active = false,
    this.size = 50.0,
    this.iconSize = 22.0,
    this.activeColor,
    this.idleColor,
    this.backgroundColor,
  });

  final IconData icon;
  final VoidCallback onTap;
  final bool active;
  final double size;
  final double iconSize;
  final Color? activeColor;
  final Color? idleColor;
  final Color? backgroundColor;

  @override
  Widget build(BuildContext context) {
    final effectiveActiveColor = activeColor ?? AppColors.accent;
    final effectiveIdleColor = idleColor ?? Colors.white;
    final effectiveBg = backgroundColor ??
        Colors.white.withValues(alpha: active ? 0.24 : 0.14);

    return _ButtonPress(
      scale: 0.88,
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 320),
        curve: Curves.easeOutCubic,
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: effectiveBg,
          shape: BoxShape.circle,
        ),
        alignment: Alignment.center,
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 240),
          transitionBuilder: (child, anim) => ScaleTransition(scale: anim, child: child),
          child: Icon(
            icon,
            key: ValueKey('${icon.codePoint}_$active'),
            size: iconSize,
            color: active ? effectiveActiveColor : effectiveIdleColor,
          ),
        ),
      ),
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Unified Play + Shuffle Row (Album / Artist / Explore Hero)         */
/* ------------------------------------------------------------------ */

class ZenPlayShuffleRow extends StatelessWidget {
  const ZenPlayShuffleRow({
    super.key,
    required this.onPlay,
    required this.onShuffle,
    this.isPlaying = false,
    this.playLabel,
    this.extraAction,
    this.height = 50.0,
  });

  final VoidCallback onPlay;
  final VoidCallback onShuffle;
  final bool isPlaying;
  final String? playLabel;
  final Widget? extraAction;
  final double height;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        ZenActionCircle(
          size: height,
          icon: CupertinoIcons.shuffle,
          onTap: onShuffle,
        ),
        const SizedBox(width: 10),
        Expanded(
          child: ZenPlayButton(
            height: height,
            isPlaying: isPlaying,
            label: playLabel,
            expanded: true,
            onTap: onPlay,
          ),
        ),
        if (extraAction != null) ...[
          const SizedBox(width: 10),
          extraAction!,
        ],
      ],
    );
  }
}

