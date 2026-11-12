import 'package:flutter/cupertino.dart';
import '../../../design_system/apple/apple_kit.dart';
import '../../../design_system/apple/apple_tokens.dart';

class PersonalityCard extends StatelessWidget {
  final Map<String, dynamic> musicPersonality;

  const PersonalityCard({super.key, required this.musicPersonality});

  void _showDetailsSheet(BuildContext context, String title, String subtitle) {
    AppleSheet.show<void>(
      context,
      initial: 0.56,
      builder: (ctx, sc) => ListView(
        controller: sc,
        padding: const EdgeInsets.only(bottom: 32),
        children: [
          SheetHeader(title: title, subtitle: subtitle),
          const SizedBox(height: 8),
          GroupedSection(
            title: 'HOW THIS PROFILE IS BUILT',
            footer: 'Calculated from your recent listening sessions in Zenify Replay.',
            children: const [
              AppleRow(
                leading: IconTile(CupertinoIcons.moon_stars_fill, color: AT.accent),
                title: 'Listening Rhythm',
                subtitle: 'Checks whether your peak sessions cluster late at night or during daytime hours.',
              ),
              AppleRow(
                leading: IconTile(CupertinoIcons.arrow_right_arrow_left, color: AT.blue),
                title: 'Skip Discipline',
                subtitle: 'Compares full listens against quick skips across your queue.',
              ),
              AppleRow(
                leading: IconTile(CupertinoIcons.compass_fill, color: AT.green),
                title: 'Artist & Genre Breadth',
                subtitle: 'Balances fresh artists discovered against comfort repeats.',
              ),
              AppleRow(
                leading: IconTile(CupertinoIcons.repeat, color: AT.amber),
                title: 'Replay Loyalty',
                subtitle: 'Tracks how often your favorite songs return in heavy rotation.',
              ),
            ],
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final title = musicPersonality['title'] as String? ?? 'Eclectic Listener';
    final subtitle =
        musicPersonality['subtitle'] as String? ?? 'Exploring sounds across moods and eras.';

    return GroupedSection(
      title: 'LISTENING PERSONA',
      children: [
        AppleRow(
          leading: const IconTile(CupertinoIcons.sparkles, color: AT.accent),
          title: title,
          subtitle: subtitle,
          trailing: const Icon(
            CupertinoIcons.chevron_right,
            size: 16,
            color: AT.label3,
          ),
          onTap: () => _showDetailsSheet(context, title, subtitle),
        ),
      ],
    );
  }
}
