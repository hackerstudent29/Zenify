import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../../design_system/apple/apple_kit.dart';
import '../../../design_system/apple/apple_tokens.dart';
import '../../../models/room_phase2_models.dart';
import '../../../services/together_service.dart';
import '../../../utils/share_image.dart';
import '../activity/activity_feed.dart';

/// Achievements are awarded and validated by the server only. This screen is read-only.
class AchievementsScreen extends StatefulWidget {
  const AchievementsScreen({super.key});
  @override
  State<AchievementsScreen> createState() => _AchievementsScreenState();
}

class _AchievementsScreenState extends State<AchievementsScreen> {
  List<AchievementItem>? _items;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    setState(() => _failed = false);
    try {
      final r = await context.read<TogetherService>().fetchAchievements();
      if (mounted) setState(() => _items = r);
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = _items;
    final unlocked = items?.where((e) => e.unlocked).toList() ?? [];
    final locked = items?.where((e) => !e.unlocked).toList() ?? [];
    return Scaffold(
      backgroundColor: AT.bg,
      body: SafeArea(
        child: CustomScrollView(physics: const BouncingScrollPhysics(), slivers: [
          SliverToBoxAdapter(child: Padding(padding: const EdgeInsets.fromLTRB(16, 8, 16, 0), child: Row(children: [CircleIconButton(icon: CupertinoIcons.chevron_left, onTap: () => Navigator.pop(context))]))),
          const SliverToBoxAdapter(child: Padding(padding: EdgeInsets.fromLTRB(20, 16, 20, 16), child: Text('Achievements', style: AT.largeTitle))),
          if (_failed)
            SliverFillRemaining(hasScrollBody: false, child: Center(child: PillButton(label: 'Retry', compact: true, style: PillStyle.glass, onTap: _load)))
          else if (items == null)
            const SliverFillRemaining(hasScrollBody: false, child: Center(child: CupertinoActivityIndicator()))
          else ...[
            if (unlocked.isNotEmpty)
              SliverToBoxAdapter(
                child: GroupedSection(title: 'Unlocked', children: [
                  for (final a in unlocked)
                    AppleRow(
                      leading: const IconTile(CupertinoIcons.rosette, color: AT.amber),
                      title: a.title,
                      subtitle: '${a.description} · ${relativeTime(a.unlockedMs!)} ago',
                      trailing: CircleIconButton(icon: CupertinoIcons.share, size: 32, iconSize: 14, onTap: () => showAchievementCard(context, a)),
                    ),
                ]),
              ),
            SliverToBoxAdapter(
              child: GroupedSection(title: 'In progress', children: [
                for (final a in locked)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [Expanded(child: Text(a.title, style: AT.body.copyWith(fontSize: 16))), Text('${a.progress.round()}/${a.target.round()}', style: AT.caption)]),
                      const SizedBox(height: 2),
                      Text(a.description, style: AT.footnote),
                      const SizedBox(height: 10),
                      ClipRRect(borderRadius: BorderRadius.circular(3), child: LinearProgressIndicator(value: a.fraction, minHeight: 5, backgroundColor: AT.fillStrong, valueColor: const AlwaysStoppedAnimation(AT.accent))),
                    ]),
                  ),
              ]),
            ),
          ],
          SliverToBoxAdapter(child: SizedBox(height: MediaQuery.paddingOf(context).bottom + 24)),
        ]),
      ),
    );
  }
}

/// Shareable achievement card, rendered to image via RepaintBoundary.
Future<void> showAchievementCard(BuildContext context, AchievementItem a) {
  final key = GlobalKey();
  return AppleSheet.show<void>(context, initial: 0.7, builder: (ctx, sc) {
    return ListView(controller: sc, padding: const EdgeInsets.all(24), children: [
      Center(
        child: RepaintBoundary(
          key: key,
          child: Container(
            width: 300,
            height: 360,
            padding: const EdgeInsets.all(28),
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(28), gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFFFFD60A), Color(0xFFFA586A), Color(0xFF1A0B2E)])),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('ROOM TOGETHER', style: AT.micro.copyWith(color: Colors.black54, letterSpacing: 1.4)),
              const Spacer(),
              const Icon(CupertinoIcons.rosette, size: 64, color: Colors.white),
              const SizedBox(height: 16),
              Text(a.title.toUpperCase(), style: AT.title1.copyWith(color: Colors.white, fontSize: 28)),
              const SizedBox(height: 6),
              Text(a.description, style: AT.subhead.copyWith(color: Colors.white70)),
              const SizedBox(height: 18),
              Text('zenify', style: AT.headline.copyWith(color: Colors.white54)),
            ]),
          ),
        ),
      ),
      const SizedBox(height: 20),
      PillButton(
        label: 'Share',
        icon: CupertinoIcons.share,
        expand: true,
        onTap: () async {
          final ok = await shareBoundaryAsImage(key, fileName: 'zenify_${a.id}', text: 'I unlocked ${a.title} on Zenify');
          if (!ok && ctx.mounted) appleToast(ctx, 'Could not create the image.');
        },
      ),
    ]);
  });
}

/// Drop into the room screen's Stack. Shows a spring-in banner when the SERVER reports an unlock.
class AchievementUnlockOverlay extends StatefulWidget {
  const AchievementUnlockOverlay({super.key});
  @override
  State<AchievementUnlockOverlay> createState() => _OverlayState();
}

class _OverlayState extends State<AchievementUnlockOverlay> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 520));
  AchievementItem? _showing;

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  Future<void> _present(AchievementItem a) async {
    setState(() => _showing = a);
    HapticFeedback.heavyImpact();
    await _c.forward(from: 0);
    await Future<void>.delayed(const Duration(milliseconds: 2800));
    if (!mounted) return;
    await _c.reverse();
    if (mounted) {
      setState(() => _showing = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.watch<TogetherService>();
    final a = t.lastUnlocked;
    if (a != null && _showing == null) {
      t.ackUnlocked();
      WidgetsBinding.instance.addPostFrameCallback((_) => _present(a));
    }
    final s = _showing;
    if (s == null) return const SizedBox.shrink();
    return Positioned(
      top: MediaQuery.paddingOf(context).top + 8,
      left: 20,
      right: 20,
      child: AnimatedBuilder(
        animation: _c,
        builder: (_, child) => Opacity(opacity: _c.value.clamp(0.0, 1.0), child: Transform.translate(offset: Offset(0, -30 * (1 - Curves.easeOutBack.transform(_c.value))), child: child)),
        child: AppleBlur(
          borderRadius: BorderRadius.circular(AT.rLg),
          tint: const Color(0xCC2C2C2E),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(children: [
              const IconTile(CupertinoIcons.rosette, color: AT.amber, size: 40),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('Achievement unlocked', style: AT.micro.copyWith(color: AT.amber)), Text(s.title, style: AT.headline)])),
            ]),
          ),
        ),
      ),
    );
  }
}
