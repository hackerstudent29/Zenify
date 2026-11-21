import 'package:flutter/cupertino.dart';

import '../core/atlas_tokens.dart';
import 'atlas_press.dart';

/// Apple-style red back chevron.
class AtlasBackButton extends StatelessWidget {
  const AtlasBackButton({super.key});

  @override
  Widget build(BuildContext context) => AtlasPress(
    scale: 0.88,
    onTap: () => Navigator.of(context).maybePop(),
    child: const SizedBox(
      width: 44,
      height: 44,
      child: Align(
        alignment: Alignment.centerLeft,
        child: Padding(
          padding: EdgeInsets.only(left: 8),
          child: Icon(
            CupertinoIcons.chevron_back,
            size: 26,
            color: AtlasColors.accent,
          ),
        ),
      ),
    ),
  );
}
