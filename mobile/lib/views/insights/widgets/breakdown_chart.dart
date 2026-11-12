import 'package:flutter/cupertino.dart';
import '../../../design_system/apple/apple_tokens.dart';

class BreakdownChart extends StatelessWidget {
  final List<dynamic> genres;
  final List<dynamic> languages;

  const BreakdownChart({
    super.key,
    required this.genres,
    required this.languages,
  });

  @override
  Widget build(BuildContext context) {
    if (genres.isEmpty && languages.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(left: 14, bottom: 8),
            child: Text(
              'GENRES & LANGUAGES',
              style: AT.caption.copyWith(
                color: AT.label2,
                fontWeight: FontWeight.w600,
                letterSpacing: 0.6,
              ),
            ),
          ),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AT.surface,
              borderRadius: BorderRadius.circular(AT.rMd),
              border: Border.all(color: AT.hairline, width: 0.6),
            ),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final g in genres)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 7,
                    ),
                    decoration: BoxDecoration(
                      color: AT.surfaceHi,
                      borderRadius: BorderRadius.circular(AT.rPill),
                    ),
                    child: Text(
                      '${g['genre']} · ${g['count']}',
                      style: AT.footnote.copyWith(
                        color: AT.label,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                for (final l in languages)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 7,
                    ),
                    decoration: BoxDecoration(
                      color: AT.accent.withValues(alpha: 0.16),
                      borderRadius: BorderRadius.circular(AT.rPill),
                    ),
                    child: Text(
                      '${l['language'].toString().toUpperCase()} · ${l['count']}',
                      style: AT.footnote.copyWith(
                        color: AT.accent,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
