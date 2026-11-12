import 'dart:async';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../design_system/apple/apple_kit.dart';
import '../../design_system/apple/apple_tokens.dart';
import '../../services/auth_state.dart';
import '../../services/country_service.dart';
import '../../services/dock_visibility.dart';
import '../../services/innertube_service.dart';
import '../../services/user_preferences_service.dart';

/// Shared helper to present an Apple Music–style Layer-1 bottom sheet.
Future<T?> _showAppleBottomSheet<T>(
  BuildContext context, {
  required WidgetBuilder builder,
}) {
  HapticFeedback.mediumImpact();
  return DockVisibility.runModal(
    () => showModalBottomSheet<T>(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withValues(alpha: 0.72),
      builder: builder,
    ),
  );
}

class _BaseEditSheetShell extends StatefulWidget {
  final String title;
  final String? subtitle;
  final String saveLabel;
  final bool canSave;
  final bool saving;
  final VoidCallback onSave;
  final Widget child;
  final double heightFactor;

  const _BaseEditSheetShell({
    required this.title,
    this.subtitle,
    required this.saveLabel,
    required this.canSave,
    required this.saving,
    required this.onSave,
    required this.child,
    this.heightFactor = 0.78,
  });

  @override
  State<_BaseEditSheetShell> createState() => _BaseEditSheetShellState();
}

class _BaseEditSheetShellState extends State<_BaseEditSheetShell> with HideDocksMixin {
  @override
  bool get hideMiniPlayerWhileActive => true;

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final bottomInset = media.viewInsets.bottom;
    final clampedHeight = ((media.size.height - bottomInset) * widget.heightFactor).clamp(320.0, 720.0);

    return AnimatedPadding(
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOutCubic,
      padding: EdgeInsets.only(bottom: bottomInset),
      child: Material(
        color: Colors.transparent,
        child: Container(
          height: clampedHeight,
          decoration: BoxDecoration(
            color: AT.surface,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(AT.rXl)),
            border: const Border(top: BorderSide(color: AT.hairline, width: 0.7)),
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 10, 16, 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Center(
                      child: Container(
                        width: 36,
                        height: 4,
                        decoration: BoxDecoration(
                          color: AT.fillStrong,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(widget.title, style: AT.title3),
                              if (widget.subtitle != null) ...[
                                const SizedBox(height: 2),
                                Text(widget.subtitle!, style: AT.footnote),
                              ],
                            ],
                          ),
                        ),
                        CircleIconButton(
                          icon: CupertinoIcons.xmark,
                          size: 30,
                          onTap: () => Navigator.of(context).pop(),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const Divider(height: 0.6, thickness: 0.6, color: AT.hairline),
              Expanded(child: widget.child),
              Container(
                decoration: const BoxDecoration(
                  color: AT.surface,
                  border: Border(top: BorderSide(color: AT.hairline, width: 0.6)),
                ),
                child: SafeArea(
                  top: false,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 12, 20, 14),
                    child: PillButton(
                      label: widget.saveLabel,
                      style: PillStyle.filled,
                      expand: true,
                      loading: widget.saving,
                      onTap: widget.canSave && !widget.saving ? widget.onSave : null,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ───────────────────────── 1. Identity Sheet (Name, Handle, Age, Gender) ─────────────────────────

Future<void> showIdentityEditSheet(BuildContext context) {
  return _showAppleBottomSheet<void>(
    context,
    builder: (_) => const _IdentityEditSheet(),
  );
}

class _IdentityEditSheet extends StatefulWidget {
  const _IdentityEditSheet();

  @override
  State<_IdentityEditSheet> createState() => _IdentityEditSheetState();
}

class _IdentityEditSheetState extends State<_IdentityEditSheet> {
  late final TextEditingController _nameCtrl;
  late final TextEditingController _usernameCtrl;
  late final TextEditingController _ageCtrl;
  String? _gender;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final auth = context.read<AuthState>();
    final saved = UserPreferencesService.instance.current;
    final resolvedName = UserPreferencesService.resolveDisplayName(
      accountName: auth.user?.name,
      displayName: auth.user?.displayName,
      username: auth.user?.username,
    );
    _nameCtrl = TextEditingController(
      text: resolvedName == 'Listener' ? '' : resolvedName,
    );
    _usernameCtrl = TextEditingController(
      text: (auth.user?.username == 'guest') ? '' : (auth.user?.username ?? ''),
    );
    _ageCtrl = TextEditingController(
      text: saved?.age != null ? '${saved!.age}' : '',
    );
    _gender = saved?.gender;
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _usernameCtrl.dispose();
    _ageCtrl.dispose();
    super.dispose();
  }

  int? get _parsedAge {
    final raw = _ageCtrl.text.trim();
    if (raw.isEmpty) return null;
    final v = int.tryParse(raw);
    if (v == null || v < 13 || v > 100) return -1;
    return v;
  }

  Future<void> _save() async {
    final name = _nameCtrl.text.trim();
    final username = _usernameCtrl.text.trim();
    final ageVal = _parsedAge;
    if (name.isEmpty) {
      appleToast(context, 'Please enter your name.');
      return;
    }
    if (ageVal == -1) {
      appleToast(context, 'Enter an age between 13 and 100.');
      return;
    }

    setState(() => _saving = true);
    final base = UserPreferencesService.instance.current ??
        OnboardingPrefs(
          countryCode: CountryService.instance.currentCode,
          countryName: CountryService.instance.currentCountry.name,
        );

    final updated = base.copyWith(
      displayName: name,
      age: ageVal,
      clearAge: ageVal == null,
      gender: _gender,
      clearGender: _gender == null,
      completed: base.completed || base.languages.isNotEmpty,
    );

    final auth = context.read<AuthState>();
    await UserPreferencesService.instance.save(updated);
    if (auth.user != null) {
      await auth.updateProfile(
        name: name,
        displayName: name,
        username: username.isNotEmpty ? username : null,
      );
    }

    if (mounted) {
      Navigator.of(context, rootNavigator: true).pop();
      appleToast(context, 'Profile saved', icon: CupertinoIcons.checkmark_circle_fill);
    }
  }

  @override
  Widget build(BuildContext context) {
    final canSave = _nameCtrl.text.trim().isNotEmpty && _parsedAge != -1;
    return _BaseEditSheetShell(
      title: 'Edit Profile',
      subtitle: 'Name, username, age & gender',
      saveLabel: 'Save Changes',
      canSave: canSave,
      saving: _saving,
      heightFactor: 0.72,
      onSave: _save,
      child: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(4, 16, 4, 20),
        children: [
          GroupedSection(
            title: 'IDENTITY',
            children: [
              _textFieldRow(
                icon: CupertinoIcons.person_fill,
                hint: 'Display Name',
                controller: _nameCtrl,
                caps: TextCapitalization.words,
                onChanged: (_) => setState(() {}),
              ),
              _textFieldRow(
                icon: CupertinoIcons.at,
                hint: 'Username',
                controller: _usernameCtrl,
              ),
              _textFieldRow(
                icon: CupertinoIcons.calendar,
                hint: 'Age (13–100)',
                controller: _ageCtrl,
                keyboardType: TextInputType.number,
                formatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(3),
                ],
                onChanged: (_) => setState(() {}),
              ),
            ],
          ),
          GroupedSection(
            title: 'GENDER',
            children: [
              Padding(
                padding: const EdgeInsets.all(12),
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: UserPreferencesService.genderOptions.map((g) {
                    final selected = _gender == g;
                    return SpringPressable(
                      onTap: () {
                        HapticFeedback.selectionClick();
                        setState(() => _gender = selected ? null : g);
                      },
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 180),
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                        decoration: BoxDecoration(
                          color: selected ? AT.accent : AT.surfaceHi,
                          borderRadius: BorderRadius.circular(AT.rPill),
                          border: Border.all(
                            color: selected ? AT.accent : AT.hairline,
                            width: 0.8,
                          ),
                        ),
                        child: Text(
                          g,
                          style: AT.footnote.copyWith(
                            color: selected ? Colors.white : AT.label,
                            fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _textFieldRow({
    required IconData icon,
    required String hint,
    required TextEditingController controller,
    TextCapitalization caps = TextCapitalization.none,
    TextInputType? keyboardType,
    List<TextInputFormatter>? formatters,
    ValueChanged<String>? onChanged,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      child: Row(
        children: [
          Icon(icon, size: 18, color: AT.label2),
          const SizedBox(width: 12),
          Expanded(
            child: TextField(
              controller: controller,
              textCapitalization: caps,
              keyboardType: keyboardType,
              inputFormatters: formatters,
              onChanged: onChanged,
              style: AT.body,
              cursorColor: AT.accent,
              decoration: InputDecoration(
                border: InputBorder.none,
                hintText: hint,
                hintStyle: AT.body.copyWith(color: AT.label3),
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(vertical: 10),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ───────────────────────── 2. Music Region Picker Sheet ─────────────────────────

Future<void> showRegionPickerSheet(BuildContext context) {
  return _showAppleBottomSheet<void>(
    context,
    builder: (_) => const _RegionPickerSheet(),
  );
}

class _RegionPickerSheet extends StatefulWidget {
  const _RegionPickerSheet();

  @override
  State<_RegionPickerSheet> createState() => _RegionPickerSheetState();
}

class _RegionPickerSheetState extends State<_RegionPickerSheet> {
  late CountryInfo _selected;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _selected = CountryService.instance.currentCountry;
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final base = UserPreferencesService.instance.current ?? const OnboardingPrefs();
    await UserPreferencesService.instance.save(
      base.copyWith(
        countryCode: _selected.code,
        countryName: _selected.name,
      ),
    );
    if (mounted) {
      Navigator.of(context, rootNavigator: true).pop();
      appleToast(context, 'Region set to ${_selected.name}', icon: CupertinoIcons.globe);
    }
  }

  @override
  Widget build(BuildContext context) {
    return _BaseEditSheetShell(
      title: 'Music Region',
      subtitle: 'Tunes charts, releases, and regional discovery',
      saveLabel: 'Apply Region',
      canSave: true,
      saving: _saving,
      heightFactor: 0.72,
      onSave: _save,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(4, 14, 4, 20),
        children: [
          GroupedSection(
            children: [
              for (final c in CountryService.supportedCountries)
                AppleRow(
                  leading: Text(c.flag, style: const TextStyle(fontSize: 22)),
                  title: c.name,
                  subtitle: c.code,
                  trailing: c.code == _selected.code
                      ? const Icon(CupertinoIcons.checkmark_circle_fill, color: AT.accent, size: 20)
                      : null,
                  onTap: () {
                    HapticFeedback.selectionClick();
                    setState(() => _selected = c);
                  },
                ),
            ],
          ),
        ],
      ),
    );
  }
}

// ───────────────────────── 3. Languages Picker Sheet ─────────────────────────

Future<void> showLanguagesPickerSheet(BuildContext context) {
  return _showAppleBottomSheet<void>(
    context,
    builder: (_) => const _LanguagesPickerSheet(),
  );
}

class _LanguagesPickerSheet extends StatefulWidget {
  const _LanguagesPickerSheet();

  @override
  State<_LanguagesPickerSheet> createState() => _LanguagesPickerSheetState();
}

class _LanguagesPickerSheetState extends State<_LanguagesPickerSheet> {
  late final List<String> _selected;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _selected = List<String>.from(UserPreferencesService.instance.current?.languages ?? const []);
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final country = CountryService.instance.currentCountry;
    final base = UserPreferencesService.instance.current ??
        OnboardingPrefs(countryCode: country.code, countryName: country.name);
    await UserPreferencesService.instance.save(
      base.copyWith(languages: _selected, completed: true),
    );
    if (mounted) {
      Navigator.of(context, rootNavigator: true).pop();
      appleToast(context, 'Languages updated', icon: CupertinoIcons.checkmark_circle_fill);
    }
  }

  @override
  Widget build(BuildContext context) {
    final sorted = UserPreferencesService.sortedLanguagesForCountry(
      CountryService.instance.currentCode,
    );
    return _BaseEditSheetShell(
      title: 'Languages',
      subtitle: 'Pick 1 to 6 languages you listen to',
      saveLabel: 'Save Languages (${_selected.length}/6)',
      canSave: _selected.isNotEmpty,
      saving: _saving,
      heightFactor: 0.72,
      onSave: _save,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        children: [
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: sorted.map((lang) {
              final on = _selected.contains(lang.name);
              return SpringPressable(
                onTap: () {
                  HapticFeedback.selectionClick();
                  setState(() {
                    if (on) {
                      _selected.remove(lang.name);
                    } else if (_selected.length < 6) {
                      _selected.add(lang.name);
                    } else {
                      appleToast(context, 'Up to 6 languages can be selected');
                    }
                  });
                },
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: on ? AT.accent : AT.surfaceHi,
                    borderRadius: BorderRadius.circular(AT.rPill),
                    border: Border.all(
                      color: on ? AT.accent : AT.hairline,
                      width: 0.8,
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (on) ...[
                        const Icon(CupertinoIcons.checkmark_alt, size: 15, color: Colors.white),
                        const SizedBox(width: 6),
                      ],
                      Text(
                        lang.name,
                        style: AT.callout.copyWith(
                          color: on ? Colors.white : AT.label,
                          fontWeight: on ? FontWeight.w700 : FontWeight.w600,
                        ),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        lang.nativeLabel,
                        style: AT.caption.copyWith(
                          color: on ? Colors.white.withValues(alpha: 0.85) : AT.label3,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}

// ───────────────────────── 4. Genres & Styles Picker Sheet ─────────────────────────

Future<void> showGenresPickerSheet(BuildContext context) {
  return _showAppleBottomSheet<void>(
    context,
    builder: (_) => const _GenresPickerSheet(),
  );
}

class _GenresPickerSheet extends StatefulWidget {
  const _GenresPickerSheet();

  @override
  State<_GenresPickerSheet> createState() => _GenresPickerSheetState();
}

class _GenresPickerSheetState extends State<_GenresPickerSheet> {
  late final List<String> _selected;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _selected = List<String>.from(UserPreferencesService.instance.current?.genres ?? const []);
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final country = CountryService.instance.currentCountry;
    final base = UserPreferencesService.instance.current ??
        OnboardingPrefs(countryCode: country.code, countryName: country.name);
    await UserPreferencesService.instance.save(
      base.copyWith(genres: _selected, completed: true),
    );
    if (mounted) {
      Navigator.of(context, rootNavigator: true).pop();
      appleToast(context, 'Styles updated', icon: CupertinoIcons.checkmark_circle_fill);
    }
  }

  @override
  Widget build(BuildContext context) {
    final sorted = UserPreferencesService.sortedGenresForLanguages(
      UserPreferencesService.instance.current?.languages ?? const [],
    );
    return _BaseEditSheetShell(
      title: 'Genres & Vibes',
      subtitle: 'Pick 2 to 8 favorite styles',
      saveLabel: 'Save Styles (${_selected.length}/8)',
      canSave: _selected.length >= 2,
      saving: _saving,
      heightFactor: 0.70,
      onSave: _save,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        children: [
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: sorted.map((genre) {
              final on = _selected.contains(genre);
              return SpringPressable(
                onTap: () {
                  HapticFeedback.selectionClick();
                  setState(() {
                    if (on) {
                      _selected.remove(genre);
                    } else if (_selected.length < 8) {
                      _selected.add(genre);
                    } else {
                      appleToast(context, 'Maximum 8 styles allowed');
                    }
                  });
                },
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 10),
                  decoration: BoxDecoration(
                    color: on ? AT.accent : AT.surfaceHi,
                    borderRadius: BorderRadius.circular(AT.rPill),
                    border: Border.all(color: on ? AT.accent : AT.hairline, width: 0.8),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (on) ...[
                        const Icon(CupertinoIcons.checkmark_alt, size: 15, color: Colors.white),
                        const SizedBox(width: 6),
                      ],
                      Text(
                        genre,
                        style: AT.callout.copyWith(
                          color: on ? Colors.white : AT.label,
                          fontWeight: on ? FontWeight.w700 : FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}

// ───────────────────────── 5. Favorite Artists Picker Sheet ─────────────────────────

Future<void> showArtistsPickerSheet(BuildContext context) {
  return _showAppleBottomSheet<void>(
    context,
    builder: (_) => const _ArtistsPickerSheet(),
  );
}

class _ArtistsPickerSheet extends StatefulWidget {
  const _ArtistsPickerSheet();

  @override
  State<_ArtistsPickerSheet> createState() => _ArtistsPickerSheetState();
}

class _ArtistsPickerSheetState extends State<_ArtistsPickerSheet> {
  final _searchCtrl = TextEditingController();
  final Map<String, OnboardingArtist> _selected = {};
  final Map<String, ({String id, String image})> _meta = {};
  List<({String id, String name, String image})> _searchResults = const [];
  Timer? _debounce;
  String _query = '';
  bool _searching = false;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    for (final a in UserPreferencesService.instance.current?.favoriteArtists ?? const <OnboardingArtist>[]) {
      _selected[a.name.toLowerCase()] = a;
      if (a.image.isNotEmpty) {
        _meta[a.name.toLowerCase()] = (id: a.id, image: a.image);
      }
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
    setState(() => _query = q);
    if (q.length < 2) {
      setState(() {
        _searching = false;
        _searchResults = const [];
      });
      return;
    }
    setState(() => _searching = true);
    _debounce = Timer(const Duration(milliseconds: 300), () async {
      final hits = await InnerTubeService.instance.searchArtists(q, limit: 15);
      if (!mounted || _query != q) return;
      for (final h in hits) {
        if (h.image.isNotEmpty) {
          _meta[h.name.toLowerCase()] = (id: h.id, image: h.image);
        }
      }
      setState(() {
        _searching = false;
        _searchResults = hits;
      });
    });
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final country = CountryService.instance.currentCountry;
    final base = UserPreferencesService.instance.current ??
        OnboardingPrefs(countryCode: country.code, countryName: country.name);
    await UserPreferencesService.instance.save(
      base.copyWith(favoriteArtists: _selected.values.toList(), completed: true),
    );
    if (mounted) {
      Navigator.of(context, rootNavigator: true).pop();
      appleToast(context, 'Favorite artists updated', icon: CupertinoIcons.checkmark_circle_fill);
    }
  }

  @override
  Widget build(BuildContext context) {
    final curated = UserPreferencesService.curatedArtistsForLanguages(
      UserPreferencesService.instance.current?.languages ?? const [],
    );
    final items = _query.length >= 2
        ? _searchResults.map((e) => OnboardingArtist(id: e.id, name: e.name, image: e.image)).toList()
        : curated.map((name) {
            final m = _meta[name.toLowerCase()];
            return OnboardingArtist(id: m?.id ?? name, name: name, image: m?.image ?? '');
          }).toList();

    return _BaseEditSheetShell(
      title: 'Favorite Artists',
      subtitle: 'Pick 3 to 10 artists (${_selected.length} selected)',
      saveLabel: 'Save Artists (${_selected.length})',
      canSave: _selected.length >= 3,
      saving: _saving,
      heightFactor: 0.84,
      onSave: _save,
      child: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(20, 14, 20, 20),
        children: [
          CupertinoSearchTextField(
            controller: _searchCtrl,
            onChanged: _onQuery,
            placeholder: 'Search any artist...',
            style: AT.body,
            placeholderStyle: AT.subhead.copyWith(color: AT.label3),
            backgroundColor: AT.fill,
          ),
          if (_selected.isNotEmpty) ...[
            const SizedBox(height: 12),
            SizedBox(
              height: 34,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: _selected.length,
                separatorBuilder: (_, _) => const SizedBox(width: 8),
                itemBuilder: (ctx, i) {
                  final artist = _selected.values.elementAt(i);
                  return SpringPressable(
                    onTap: () => setState(() => _selected.remove(artist.name.toLowerCase())),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      decoration: BoxDecoration(
                        color: AT.accent.withValues(alpha: 0.16),
                        borderRadius: BorderRadius.circular(AT.rPill),
                        border: Border.all(color: AT.accent.withValues(alpha: 0.45), width: 0.8),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(artist.name, style: AT.caption.copyWith(color: AT.label, fontWeight: FontWeight.w600)),
                          const SizedBox(width: 5),
                          const Icon(CupertinoIcons.xmark, size: 12, color: AT.accent),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
          const SizedBox(height: 16),
          if (_searching)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 28),
              child: Center(child: CupertinoActivityIndicator()),
            )
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
              itemBuilder: (ctx, i) {
                final a = items[i];
                final key = a.name.toLowerCase();
                final on = _selected.containsKey(key);
                return SpringPressable(
                  onTap: () {
                    HapticFeedback.selectionClick();
                    setState(() {
                      if (on) {
                        _selected.remove(key);
                      } else if (_selected.length < 10) {
                        _selected[key] = a;
                      } else {
                        appleToast(context, 'Maximum 10 artists allowed');
                      }
                    });
                  },
                  child: Column(
                    children: [
                      Stack(
                        clipBehavior: Clip.none,
                        children: [
                          AnimatedContainer(
                            duration: const Duration(milliseconds: 180),
                            padding: const EdgeInsets.all(2.5),
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(color: on ? AT.accent : Colors.transparent, width: 2.2),
                            ),
                            child: a.image.isNotEmpty
                                ? ClipOval(
                                    child: Image.network(
                                      a.image,
                                      width: 72,
                                      height: 72,
                                      fit: BoxFit.cover,
                                      cacheWidth: 160,
                                      errorBuilder: (_, _, _) => Avatar(name: a.name, size: 72),
                                    ),
                                  )
                                : Avatar(name: a.name, size: 72),
                          ),
                          if (on)
                            Positioned(
                              right: 0,
                              bottom: 0,
                              child: Container(
                                width: 22,
                                height: 22,
                                decoration: BoxDecoration(
                                  color: AT.accent,
                                  shape: BoxShape.circle,
                                  border: Border.all(color: AT.surface, width: 2),
                                ),
                                child: const Icon(CupertinoIcons.checkmark_alt, size: 12, color: Colors.white),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        a.name,
                        maxLines: 2,
                        textAlign: TextAlign.center,
                        overflow: TextOverflow.ellipsis,
                        style: AT.caption.copyWith(
                          color: on ? AT.label : AT.label2,
                          fontWeight: on ? FontWeight.w700 : FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
        ],
      ),
    );
  }
}

