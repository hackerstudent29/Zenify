import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../design_system/tokens/app_colors.dart';

class PersonalityCard extends StatelessWidget {
  const PersonalityCard({
    super.key,
    required this.musicPersonality,
  });

  final Map<String, dynamic> musicPersonality;

  void _showPersonaExplanation(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF18181B),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 20, 24, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.white24,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 20),
            Text(
              'HOW PERSONAS ARE DETERMINED',
              style: GoogleFonts.oswald(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                letterSpacing: 1.0,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'Your Music Persona is calculated purely and deterministically from your listening telemetry:\n\n'
              '• Night Owl: >40% of qualified plays between 10 PM and 4 AM.\n'
              '• Dawn Seeker: >35% of qualified plays in early morning (5 AM – 11 AM).\n'
              '• Devoted Stan: >45% of total time focused on your #1 top artist.\n'
              '• Anthem Repeater: >35% of total plays centered on a single track.\n'
              '• Sound Explorer: High new artist discovery rate.\n'
              '• Selective Audiophile: High skip rate with curated favorites.\n'
              '• Eclectic Harmonizer: Balanced multi-genre exploration.',
              style: TextStyle(
                color: Colors.white70,
                fontSize: 12.5,
                height: 1.5,
              ),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () => Navigator.of(ctx).pop(),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.crimson,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
                child: const Text('Got It', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final title = musicPersonality['title'] as String? ?? 'Eclectic Harmonizer';
    final subtitle = musicPersonality['subtitle'] as String? ?? 'Traversing diverse musical vibrations.';

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppColors.crimson.withValues(alpha: 0.25),
            const Color(0xFF18181B),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.crimson.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.crimson.withValues(alpha: 0.20),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppColors.crimson.withValues(alpha: 0.40)),
                ),
                child: Text(
                  'YOUR MUSIC PERSONA',
                  style: GoogleFonts.oswald(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.0,
                    color: AppColors.crimson,
                  ),
                ),
              ),
              GestureDetector(
                onTap: () => _showPersonaExplanation(context),
                child: const Icon(Icons.info_outline_rounded, color: Colors.white54, size: 18),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            title,
            style: GoogleFonts.oswald(
              fontSize: 24,
              fontWeight: FontWeight.w800,
              color: Colors.white,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            subtitle,
            style: const TextStyle(
              fontSize: 13,
              color: Colors.white70,
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }
}

