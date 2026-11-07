import 'package:flutter/material.dart';
import '../zen.dart';
import 'pressable_scale.dart';

/// Standard Zenify signature button (matching the website and admin console design):
/// Zinc-900 dark background, crisp micro-border, brand-accent crimson text,
/// 10px uppercase bold tracking, and spring micro-scale press interaction.
class ZenButton extends StatelessWidget {
  const ZenButton({
    super.key,
    required this.label,
    this.icon,
    this.onTap,
    this.width,
    this.compact = false,
    this.disabled = false,
    this.accentColor,
  });

  final String label;
  final IconData? icon;
  final VoidCallback? onTap;
  final double? width;
  final bool compact;
  final bool disabled;
  final Color? accentColor;

  @override
  Widget build(BuildContext context) {
    final color = accentColor ?? Zen.rose;

    return PressableScale(
      onTap: disabled ? null : onTap,
      child: AnimatedOpacity(
        duration: const Duration(milliseconds: 180),
        opacity: disabled ? 0.45 : 1.0,
        child: Container(
          width: width,
          height: compact ? 34 : 40,
          padding: EdgeInsets.symmetric(horizontal: compact ? 12 : 18),
          decoration: BoxDecoration(
            color: const Color(0xFF18181B),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: Colors.white.withValues(alpha: 0.12),
              width: 1.0,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.35),
                blurRadius: 10,
                offset: const Offset(0, 3),
              ),
            ],
          ),
          child: Row(
            mainAxisSize: width == null ? MainAxisSize.min : MainAxisSize.max,
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              if (icon != null) ...[
                Icon(icon, size: compact ? 14 : 16, color: color),
                const SizedBox(width: 6),
              ],
              Text(
                label.toUpperCase(),
                style: TextStyle(
                  color: color,
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.5,
                  height: 1.1,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

