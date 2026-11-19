import 'dart:async';

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../design_system/apple/apple_kit.dart' show appleToast, Avatar;
import '../../design_system/apple/apple_music_kit.dart';
import '../../design_system/widgets/zen_dropdown.dart';
import '../../services/auth_state.dart';
import '../../services/country_service.dart';
import '../../services/innertube_service.dart';
import '../../services/user_preferences_service.dart';

/// Pops the sheet, then confirms with a toast.
void _done(BuildContext context, String message, {IconData icon = CupertinoIcons.checkmark_circle_fill}) {
  Navigator.of(context, rootNavigator: true).pop();
  appleToast(context, message, icon: icon);
}

OnboardingPrefs _basePrefs() {
  final country = CountryService.instance.currentCountry;
  return UserPreferencesService.instance.current ??
      OnboardingPrefs(countryCode: country.code, countryName: country.name);
}

/// Wrap of selectable chips used by both Languages and Genres.
class _ChipPicker extends StatelessWidget {
  const _ChipPicker({required this.items, required this.selected, required this.onToggle});
  final List<({String label, String? hint})> items;
  final List<String> selected;
  final ValueChanged<String> onToggle;

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const BouncingScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
      children: [
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            for (final it in items)
              AMChip(
                label: it.label,
                hint: it.hint,
                selected: selected.contains(it.label),
                onTap: () => onToggle(it.label),
              ),
          ],
        ),
      ],
    );
  }
}

// ───────────────────────── 1. Identity ─────────────────────────

Future<void> showIdentityEditSheet(BuildContext context) =>
    showAMSheet<void>(context, (_) => const _IdentitySheet());

class _IdentitySheet extends StatefulWidget {
  const _IdentitySheet();

  @override
  State<_IdentitySheet> createState() => _IdentitySheetState();
}

class _IdentitySheetState extends State<_IdentitySheet> {
  late final TextEditingController _name;
  late final TextEditingController _username;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final auth = context.read<AuthState>();
    final resolved = UserPreferencesService.resolveDisplayName(
      accountName: auth.user?.name,
      displayName: auth.user?.displayName,
      username: auth.user?.username,
    );
    _name = TextEditingController(text: resolved == 'Listener' ? '' : resolved);
    _username = TextEditingController(
      text: auth.user?.username == 'guest' ? '' : (auth.user?.username ?? ''),
    );
  }

  @override
  void dispose() {
    _name.dispose();
    _username.dispose();
    super.dispose();
  }

  bool get _canSave => _name.text.trim().isNotEmpty;

  Future<void> _save() async {
    final name = _name.text.trim();
    final username = _username.text.trim();
    final auth = context.read<AuthState>();

    setState(() => _saving = true);
    final base = _basePrefs();
    await UserPreferencesService.instance.save(
      base.copyWith(
        displayName: name,
        completed: base.completed || base.languages.isNotEmpty,
      ),
    );
    if (auth.user != null) {
      await auth.updateProfile(
        name: name,
        displayName: name,
        username: username.isNotEmpty ? username : null,
      );
    }
    if (mounted) _done(context, 'Profile saved');
  }

  Widget _field({
    required String hint,
    required TextEditingController controller,
    TextCapitalization caps = TextCapitalization.none,
    TextInputType? keyboardType,
    List<TextInputFormatter>? formatters,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: TextField(
        controller: controller,
        textCapitalization: caps,
        keyboardType: keyboardType,
        inputFormatters: formatters,
        onChanged: (_) => setState(() {}),
        style: const TextStyle(color: AM.label, fontSize: 17),
        cursorColor: AM.rose,
        decoration: InputDecoration(
          border: InputBorder.none,
          hintText: hint,
          hintStyle: const TextStyle(color: AM.label3, fontSize: 17),
          contentPadding: const EdgeInsets.symmetric(vertical: 15),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AMSheetFrame(
      title: 'Edit Profile',
      leadingLabel: 'Cancel',
      actionLabel: 'Save',
      actionEnabled: _canSave,
      actionLoading: _saving,
      onAction: _save,
      heightFactor: 0.48,
      body: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
        children: [
          Center(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 20),
              child: Avatar(
                name: _name.text.trim().isEmpty ? 'Listener' : _name.text.trim(),
                size: 84,
              ),
            ),
          ),
          AMSection(
            children: [
              _field(
                hint: 'Name',
                controller: _name,
                caps: TextCapitalization.words,
              ),
              _field(hint: 'Username', controller: _username),
            ],
          ),
        ],
      ),
    );
  }
}

// ───────────────────────── 2. Region ─────────────────────────

Future<void> showRegionPickerSheet(BuildContext context) async {
  final current = CountryService.instance.currentCountry;
  await ZenDropdown.show(
    context: context,
    title: 'Music Region',
    subtitle: 'Sets charts, new releases and regional discovery.',
    items: [
      for (final c in CountryService.supportedCountries)
        ZenDropdownItem(
          title: '${c.flag}  ${c.name}',
          icon: c.code == current.code
              ? CupertinoIcons.checkmark_alt
              : CupertinoIcons.globe,
          isSelected: c.code == current.code,
          onTap: () async {
            await UserPreferencesService.instance.save(
              _basePrefs().copyWith(countryCode: c.code, countryName: c.name),
            );
            if (context.mounted) {
              appleToast(context, 'Region set to ${c.name}', icon: CupertinoIcons.globe);
            }
          },
        ),
    ],
  );
}

// ───────────────────────── 3. Languages ─────────────────────────

Future<void> showLanguagesPickerSheet(BuildContext context) =>
    showAMSheet<void>(context, (_) => const _LanguagesSheet());

class _LanguagesSheet extends StatefulWidget {
  const _LanguagesSheet();

  @override
  State<_LanguagesSheet> createState() => _LanguagesSheetState();
}

class _LanguagesSheetState extends State<_LanguagesSheet> {
  late final List<String> _selected =
      List<String>.from(UserPreferencesService.instance.current?.languages ?? const []);
  bool _saving = false;

  void _toggle(String name) {
    setState(() {
      if (_selected.contains(name)) {
        _selected.remove(name);
      } else if (_selected.length < 6) {
        _selected.add(name);
      } else {
        appleToast(context, 'Up to 6 languages');
      }
    });
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    await UserPreferencesService.instance.save(_basePrefs().copyWith(languages: _selected, completed: true));
    if (mounted) _done(context, 'Languages updated');
  }

  @override
  Widget build(BuildContext context) {
    final sorted = UserPreferencesService.sortedLanguagesForCountry(CountryService.instance.currentCode);
    return AMSheetFrame(
      title: 'Languages',
      subtitle: '${_selected.length} of 6 selected',
      leadingLabel: 'Cancel',
      actionLabel: 'Save',
      actionEnabled: _selected.isNotEmpty,
      actionLoading: _saving,
      onAction: _save,
      heightFactor: 0.72,
      body: _ChipPicker(
        items: [for (final l in sorted) (label: l.name, hint: l.nativeLabel)],
        selected: _selected,
        onToggle: _toggle,
      ),
    );
  }
}

// ───────────────────────── 4. Genres ─────────────────────────

Future<void> showGenresPickerSheet(BuildContext context) =>
    showAMSheet<void>(context, (_) => const _GenresSheet());

class _GenresSheet extends StatefulWidget {
  const _GenresSheet();

  @override
  State<_GenresSheet> createState() => _GenresSheetState();
}

class _GenresSheetState extends State<_GenresSheet> {
  late final List<String> _selected =
      List<String>.from(UserPreferencesService.instance.current?.genres ?? const []);
  bool _saving = false;

  void _toggle(String g) {
    setState(() {
      if (_selected.contains(g)) {
        _selected.remove(g);
      } else if (_selected.length < 8) {
        _selected.add(g);
      } else {
        appleToast(context, 'Up to 8 genres');
      }
    });
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    await UserPreferencesService.instance.save(_basePrefs().copyWith(genres: _selected, completed: true));
    if (mounted) _done(context, 'Genres updated');
  }

  @override
  Widget build(BuildContext context) {
    final sorted = UserPreferencesService.sortedGenresForLanguages(
      UserPreferencesService.instance.current?.languages ?? const [],
    );
    return AMSheetFrame(
      title: 'Genres & Vibes',
      subtitle: '${_selected.length} of 8 selected. Pick at least 2.',
      leadingLabel: 'Cancel',
      actionLabel: 'Save',
      actionEnabled: _selected.length >= 2,
      actionLoading: _saving,
      onAction: _save,
      heightFactor: 0.72,
      body: _ChipPicker(
        items: [for (final g in sorted) (label: g, hint: null)],
        selected: _selected,
        onToggle: _toggle,
      ),
    );
  }
}

// ───────────────────────── 5. Favorite artists ─────────────────────────

Future<void> showArtistsPickerSheet(BuildContext context) =>
    showAMSheet<void>(context, (_) => const _ArtistsSheet());

class _ArtistsSheet extends StatefulWidget {
  const _ArtistsSheet();

  @override
  State<_ArtistsSheet> createState() => _ArtistsSheetState();
}

class _ArtistsSheetState extends State<_ArtistsSheet> {
  final _searchCtrl = TextEditingController();
  final Map<String, OnboardingArtist> _selected = {};
  final Map<String, ({String id, String image})> _meta = {};
  List<({String id, String name, String image})> _results = const [];
  Timer? _debounce;
  String _query = '';
  bool _searching = false;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    for (final a in UserPreferencesService.instance.current?.favoriteArtists ?? const <OnboardingArtist>[]) {
      _selected[a.name.toLowerCase()] = a;
      if (a.image.isNotEmpty) _meta[a.name.toLowerCase()] = (id: a.id, image: a.image);
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchCtrl.dispose();
    super.dispose();
  }

  void _onQuery(String val) {
    _debounce?.cancel();
    final q = val.trim();
    if (q.length < 2) {
      setState(() {
        _query = q;
        _searching = false;
        _results = const [];
      });
      return;
    }
    setState(() {
      _query = q;
      _searching = true;
    });
    _debounce = Timer(const Duration(milliseconds: 300), () async {
      final hits = await InnerTubeService.instance.searchArtists(q, limit: 15);
      if (!mounted || _query != q) return;
      for (final h in hits) {
        if (h.image.isNotEmpty) _meta[h.name.toLowerCase()] = (id: h.id, image: h.image);
      }
      setState(() {
        _searching = false;
        _results = hits;
      });
    });
  }

  void _toggle(OnboardingArtist a) {
    final key = a.name.toLowerCase();
    setState(() {
      if (_selected.containsKey(key)) {
        _selected.remove(key);
      } else if (_selected.length < 10) {
        _selected[key] = a;
      } else {
        appleToast(context, 'Up to 10 artists');
      }
    });
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    await UserPreferencesService.instance.save(
      _basePrefs().copyWith(favoriteArtists: _selected.values.toList(), completed: true),
    );
    if (mounted) _done(context, 'Favorite artists updated');
  }

  @override
  Widget build(BuildContext context) {
    final curated = UserPreferencesService.curatedArtistsForLanguages(
      UserPreferencesService.instance.current?.languages ?? const [],
    );
    final items = _query.length >= 2
        ? [for (final e in _results) OnboardingArtist(id: e.id, name: e.name, image: e.image)]
        : [
            for (final name in curated)
              OnboardingArtist(
                id: _meta[name.toLowerCase()]?.id ?? name,
                name: name,
                image: _meta[name.toLowerCase()]?.image ?? '',
              ),
          ];

    return AMSheetFrame(
      title: 'Favorite Artists',
      subtitle: '${_selected.length} of 10 selected. Pick at least 3.',
      leadingLabel: 'Cancel',
      actionLabel: 'Save',
      actionEnabled: _selected.length >= 3,
      actionLoading: _saving,
      onAction: _save,
      heightFactor: 0.86,
      body: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
        children: [
          CupertinoSearchTextField(
            controller: _searchCtrl,
            onChanged: _onQuery,
            placeholder: 'Search artists',
            style: const TextStyle(
              fontFamily: 'SF Pro',
              color: AM.label,
              fontSize: 17,
            ),
            placeholderStyle: const TextStyle(
              fontFamily: 'SF Pro',
              color: AM.label3,
              fontSize: 17,
            ),
            backgroundColor: AM.card,
          ),
          const SizedBox(height: 16),
          if (_searching)
            const Padding(padding: EdgeInsets.symmetric(vertical: 32), child: Center(child: CupertinoActivityIndicator()))
          else
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: items.length,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                mainAxisSpacing: 14,
                crossAxisSpacing: 12,
                childAspectRatio: 0.78,
              ),
              itemBuilder: (_, i) => _ArtistTile(
                artist: items[i],
                selected: _selected.containsKey(items[i].name.toLowerCase()),
                onTap: () => _toggle(items[i]),
              ),
            ),
        ],
      ),
    );
  }
}

class _ArtistTile extends StatelessWidget {
  const _ArtistTile({required this.artist, required this.selected, required this.onTap});
  final OnboardingArtist artist;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AMTap(
      onTap: () {
        AM.tick();
        onTap();
      },
      child: Column(
        children: [
          Stack(
            clipBehavior: Clip.none,
            children: [
              AnimatedContainer(
                duration: AM.dur(220),
                curve: Curves.easeOutCubic,
                padding: const EdgeInsets.all(3),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: selected ? AM.rose : Colors.transparent, width: 2.2),
                ),
                child: artist.image.isNotEmpty
                    ? ClipOval(
                        child: Image.network(
                          artist.image,
                          width: 72,
                          height: 72,
                          fit: BoxFit.cover,
                          cacheWidth: 160,
                          errorBuilder: (_, _, _) => Avatar(name: artist.name, size: 72),
                        ),
                      )
                    : Avatar(name: artist.name, size: 72),
              ),
              Positioned(
                right: 0,
                bottom: 0,
                child: AnimatedScale(
                  scale: selected ? 1 : 0,
                  duration: AM.dur(260),
                  curve: Curves.easeOutBack,
                  child: Container(
                    width: 22,
                    height: 22,
                    decoration: BoxDecoration(
                      color: AM.rose,
                      shape: BoxShape.circle,
                      border: Border.all(color: AM.bg, width: 2),
                    ),
                    child: const Icon(CupertinoIcons.checkmark_alt, size: 12, color: Colors.white),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            artist.name,
            maxLines: 2,
            textAlign: TextAlign.center,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontFamily: 'SF Pro',
              color: selected ? AM.label : AM.label2,
              fontSize: 12,
              fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
