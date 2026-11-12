import 'package:flutter/cupertino.dart';
import '../../../design_system/apple/apple_kit.dart';
import '../../../design_system/apple/apple_tokens.dart';

class AchievementsCard extends StatelessWidget {
  final List<dynamic> achievements;

  const AchievementsCard({super.key, required this.achievements});

  @override
  Widget build(BuildContext context) {
    if (achievements.isEmpty) return const SizedBox.shrink();

    return GroupedSection(
      title: 'MILESTONES UNLOCKED',
      children: achievements.map((a) {
        final item = a as Map<String, dynamic>? ?? const {};
        final title = item['title']?.toString() ??
            item['badgeId']?.toString() ??
            'Milestone';
        final desc = item['description']?.toString();
        return AppleRow(
          leading: const IconTile(CupertinoIcons.rosette, color: AT.amber),
          title: title,
          subtitle: desc,
        );
      }).toList(),
    );
  }
}
