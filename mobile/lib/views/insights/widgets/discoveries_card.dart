import 'package:flutter/cupertino.dart';
import '../../../design_system/apple/apple_kit.dart';
import '../../../design_system/apple/apple_tokens.dart';

class DiscoveriesCard extends StatelessWidget {
  final int discoveriesCount;

  const DiscoveriesCard({super.key, required this.discoveriesCount});

  @override
  Widget build(BuildContext context) {
    if (discoveriesCount <= 0) return const SizedBox.shrink();

    return GroupedSection(
      title: 'DISCOVERY',
      children: [
        AppleRow(
          leading: const IconTile(CupertinoIcons.compass_fill, color: AT.accent),
          title:
              '$discoveriesCount ${discoveriesCount == 1 ? 'new artist' : 'new artists'} explored',
          subtitle: 'Fresh voices added to your rotation in this period.',
        ),
      ],
    );
  }
}
