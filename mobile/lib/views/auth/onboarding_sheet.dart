import 'dart:async';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../../design_system/apple/apple_kit.dart';
import '../../design_system/apple/apple_tokens.dart';
import '../../design_system/widgets/zen_dropdown.dart';
import '../../services/auth_state.dart';
import '../../services/country_service.dart';
import '../../services/dock_visibility.dart';
import '../../services/innertube_service.dart';
import '../../services/user_preferences_service.dart';

/// Clean 4-step Apple Music–styled onboarding bottom sheet built with the
/// shared Room Together design kit (`AT`, `GroupedSection`, `AppleRow`, `PillButton`).
///
/// Sits on the root navigator (Layer 1) and hides both the bottom nav dock and
/// the miniplayer while active so nothing overlaps or distracts.
class OnboardingSheet extends StatefulWidget {
  final VoidCallback? onCompleted;
  final bool isEditing;

  const OnboardingSheet({
    super.key,
    this.onCompleted,
    this.isEditing = false,
  });

  /// Opens [OnboardingSheet] as a Layer-1 bottom sheet on the root navigator.
  static Future<bool?> show(
    BuildContext context, {
    bool isEditing = false,
    VoidCallback? onCompleted,
  }) {
    HapticFeedback.mediumImpact();
    return DockVisibility.runModal(
      () => showModalBottomSheet<bool>(
        context: context,
        useRootNavigator: true,
        isScrollControlled: true,
        isDismissible: isEditing,
        enableDrag: isEditing,
        backgroundColor: Colors.transparent,
        barrierColor: Colors.black.withValues(alpha: 0.72),
        builder: (ctx) => OnboardingSheet(
          isEditing: isEditing,
          onCompleted: onCompleted ?? () => Navigator.of(ctx).pop(true),
        ),
      ),
    );
  }

  @override
  State<OnboardingSheet> createState() => _OnboardingSheetState();
}

class _OnboardingSheetState extends State<OnboardingSheet>
    with HideDocksMixin, SingleTickerProviderStateMixin {
  @override
  bool get hideMiniPlayerWhileActive => true;

  static const int _totalSteps = 4;

  int _step = 0;
  bool _forward = true;
  bool _saving = false;

  late final TextEditingController _nameController;
  late final TextEditingController _ageController;
  late final TextEditingController _artistSearchController;

  String? _selectedGender;
  late CountryInfo _selectedCountry;
  final List<String> _selectedLanguages = [];
  final List<String> _selectedGenres = [];
  final Map<String, OnboardingArtist> _selectedArtists = {};

  // Live artist search + lazy avatar cache so Step 4 paints immediately
  // without blocking UI and fills real circular portraits smoothly.
  Timer? _searchDebounce;
  bool _searchingArtists = false;
  String _artistQuery = '';
  List<({String id, String name, String image})> _searchResults = const [];
  final Map<String, ({String id, String image})> _resolvedArtistMeta = {};
  final Set<String> _resolvingNames = {};

  @override
  void initState() {
    super.initState();
    final saved = UserPreferencesService.instance.current;
    final authUser = context.read<AuthState>().user;

    final initialName = (saved?.displayName.isNotEmpty == true)
        ? saved!.displayName
        : (authUser?.isGuest == false ? authUser?.effectiveName ?? '' : '');
    _nameController = TextEditingController(text: initialName);
    _ageController = TextEditingController(
      text: saved?.age != null ? '${saved!.age}' : '',
    );
    _selectedGender = saved?.gender;
    _artistSearchController = TextEditingController();

    if (saved != null && saved.countryCode.isNotEmpty) {
      _selectedCountry = CountryService.supportedCountries.firstWhere(
        (c) => c.code == saved.countryCode.toUpperCase(),
        orElse: () => UserPreferencesService.detectRegionSilently(),
      );
      _selectedLanguages.addAll(saved.languages);
      _selectedGenres.addAll(saved.genres);
      for (final a in saved.favoriteArtists) {
        _selectedArtists[a.name.toLowerCase()] = a;
        if (a.image.isNotEmpty) {
          _resolvedArtistMeta[a.name.toLowerCase()] = (id: a.id, image: a.image);
        }
      }
    } else {
      _selectedCountry = UserPreferencesService.detectRegionSilently();
    }
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _nameController.dispose();
    _ageController.dispose();
    _artistSearchController.dispose();
    super.dispose();
  }

  int? get _parsedAge {
    final raw = _ageController.text.trim();
    if (raw.isEmpty) return null;
    final val = int.tryParse(raw);
    if (val == null || val < 13 || val > 100) return -1;
    return val;
  }

  bool get _canProceed {
    switch (_step) {
      case 0:
        return _parsedAge != -1;
      case 1:
        return _selectedLanguages.isNotEmpty;
      case 2:
        return _selectedGenres.length >= 2;
      case 3:
        return _selectedArtists.length >= 3;
      default:
        return false;
    }
  }

  String get _footerHint {
    switch (_step) {
      case 0:
        if (_parsedAge == -1) return 'Enter a valid age (13–100)';
        return '${_selectedCountry.flag} ${_selectedCountry.name} · Step 1 of 4';
      case 1:
        return _selectedLanguages.isEmpty
            ? 'Pick at least 1 language'
            : '${_selectedLanguages.length} of 6 selected';
      case 2:
        return _selectedGenres.length < 2
            ? 'Pick ${2 - _selectedGenres.length} more style${2 - _selectedGenres.length == 1 ? '' : 's'}'
            : '${_selectedGenres.length} styles selected';
      case 3:
        return _selectedArtists.length < 3
            ? 'Pick ${3 - _selectedArtists.length} more artist${3 - _selectedArtists.length == 1 ? '' : 's'}'
            : '${_selectedArtists.length} artists selected';
      default:
        return '';
    }
  }

  void _goBack() {
    if (_step == 0 || _saving) return;
    FocusScope.of(context).unfocus();
    HapticFeedback.selectionClick();
    setState(() {
      _forward = false;
      _step--;
    });
  }

  Future<void> _goNext() async {
    FocusScope.of(context).unfocus();
    if (!_canProceed) {
      HapticFeedback.heavyImpact();
      appleToast(context, _footerHint);
      return;
    }

    if (_step < _totalSteps - 1) {
      HapticFeedback.selectionClick();
      setState(() {
        _forward = true;
        _step++;
      });
      if (_step == 3) {
        _warmCuratedArtistAvatars();
      }
      return;
    }

    await _saveAndFinish();
  }

  Future<void> _saveAndFinish() async {
    if (_saving) return;
    setState(() => _saving = true);
    HapticFeedback.mediumImpact();

    final cleanName = _nameController.text.trim();
    final validAge = (_parsedAge != null && _parsedAge! > 0) ? _parsedAge : null;
    final prefs = OnboardingPrefs(
      displayName: cleanName,
      age: validAge,
      gender: _selectedGender,
      countryCode: _selectedCountry.code,
      countryName: _selectedCountry.name,
      languages: List<String>.from(_selectedLanguages),
      genres: List<String>.from(_selectedGenres),
      favoriteArtists: _selectedArtists.values.toList(),
      completed: true,
    );

    try {
      await UserPreferencesService.instance.save(prefs);
      if (mounted && cleanName.isNotEmpty) {
        final auth = context.read<AuthState>();
        if (auth.user != null &&
            (cleanName != auth.user!.name ||
                cleanName != auth.user!.displayName ||
                cleanName != auth.user!.username)) {
          unawaited(auth.updateProfile(
            name: cleanName,
            displayName: cleanName,
            username: cleanName,
          ));
        }
      }
    } finally {
      if (mounted) {
        setState(() => _saving = false);
        widget.onCompleted?.call();
      }
    }
  }

  Future<void> _pickCountry() async {
    FocusScope.of(context).unfocus();
    CountryInfo? picked;
    await ZenDropdown.show<void>(
      context: context,
      title: 'Music Region',
      subtitle: 'Regions with verified charts & releases',
      items: [
        for (final c in CountryService.supportedCountries)
          ZenDropdownItem(
            title: '${c.flag}  ${c.name}',
            icon: CupertinoIcons.globe,
            isSelected: c.code == _selectedCountry.code,
            onTap: () => picked = c,
          ),
      ],
    );
    if (picked != null && mounted) {
      HapticFeedback.selectionClick();
      setState(() => _selectedCountry = picked!);
    }
  }

  Future<void> _pickGender() async {
    FocusScope.of(context).unfocus();
    String? picked;
    await ZenDropdown.show<void>(
      context: context,
      title: 'Gender',
      items: [
        for (final g in UserPreferencesService.genderOptions)
          ZenDropdownItem(
            title: g,
            icon: CupertinoIcons.person_circle,
            isSelected: _selectedGender == g,
            onTap: () => picked = g,
          ),
      ],
    );
    if (picked != null && mounted) {
      HapticFeedback.selectionClick();
      setState(() => _selectedGender = picked);
    }
  }

  void _toggleLanguage(String name) {
    HapticFeedback.selectionClick();
    setState(() {
      if (_selectedLanguages.contains(name)) {
        _selectedLanguages.remove(name);
      } else {
        if (_selectedLanguages.length >= 6) {
          appleToast(context, 'You can select up to 6 languages');
          return;
        }
        _selectedLanguages.add(name);
      }
    });
  }

  void _toggleGenre(String genre) {
    HapticFeedback.selectionClick();
    setState(() {
      if (_selectedGenres.contains(genre)) {
        _selectedGenres.remove(genre);
      } else {
        if (_selectedGenres.length >= 8) {
          appleToast(context, 'You can select up to 8 styles');
          return;
        }
        _selectedGenres.add(genre);
      }
    });
  }

  void _toggleArtist(OnboardingArtist artist) {
    HapticFeedback.selectionClick();
    final key = artist.name.toLowerCase();
    setState(() {
      if (_selectedArtists.containsKey(key)) {
        _selectedArtists.remove(key);
      } else {
        if (_selectedArtists.length >= 10) {
          appleToast(context, 'Maximum 10 favorite artists');
          return;
        }
        _selectedArtists[key] = artist;
      }
    });
  }

  void _onArtistQueryChanged(String value) {
    _searchDebounce?.cancel();
    final q = value.trim();
    setState(() => _artistQuery = q);
    if (q.length < 2) {
      setState(() {
        _searchingArtists = false;
        _searchResults = const [];
      });
      return;
    }
    setState(() => _searchingArtists = true);
    _searchDebounce = Timer(const Duration(milliseconds: 320), () async {
      final hits = await InnerTubeService.instance.searchArtists(q, limit: 15);
      if (!mounted || _artistQuery != q) return;
      for (final h in hits) {
        if (h.image.isNotEmpty) {
          _resolvedArtistMeta[h.name.toLowerCase()] = (id: h.id, image: h.image);
        }
      }
      setState(() {
        _searchingArtists = false;
        _searchResults = hits;
      });
    });
  }

  /// Lazily resolves circular InnerTube portraits for curated artist names
  /// in small batches so scrolling remains buttery smooth.
  Future<void> _warmCuratedArtistAvatars() async {
    final names = UserPreferencesService.curatedArtistsForLanguages(_selectedLanguages)
        .take(12)
        .toList();
    for (final name in names) {
      if (!mounted) return;
      final key = name.toLowerCase();
      if (_resolvedArtistMeta.containsKey(key) || _resolvingNames.contains(key)) {
        continue;
      }
      _resolvingNames.add(key);
      try {
        final hit = await InnerTubeService.instance.searchArtist(name);
        if (!mounted) return;
        if (hit != null && (hit.thumb?.isNotEmpty == true || hit.browseId != null)) {
          _resolvedArtistMeta[key] = (
            id: hit.browseId ?? name,
            image: hit.thumb ?? '',
          );
          if (_selectedArtists.containsKey(key) && (hit.thumb?.isNotEmpty == true)) {
            _selectedArtists[key] = OnboardingArtist(
              id: hit.browseId ?? name,
              name: _selectedArtists[key]!.name,
              image: hit.thumb!,
            );
          }
          setState(() {});
        }
      } catch (_) {
        // Monogram fallback renders cleanly if network is unavailable.
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final bottomInset = media.viewInsets.bottom;
    final availableHeight = (media.size.height - bottomInset) * 0.88;
    final clampedHeight = availableHeight.clamp(380.0, 760.0);

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
            border: Border(
              top: BorderSide(color: AT.hairline, width: 0.7),
            ),
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            children: [
              _buildTopHeader(),
              Expanded(
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 240),
                  switchInCurve: Curves.easeOutCubic,
                  switchOutCurve: Curves.easeInCubic,
                  transitionBuilder: (child, animation) {
                    final offsetTween = Tween<Offset>(
                      begin: Offset(_forward ? 0.06 : -0.06, 0),
                      end: Offset.zero,
                    );
                    return FadeTransition(
                      opacity: animation,
                      child: SlideTransition(
                        position: offsetTween.animate(animation),
                        child: child,
                      ),
                    );
                  },
                  child: KeyedSubtree(
                    key: ValueKey(_step),
                    child: _buildCurrentStep(),
                  ),
                ),
              ),
              _buildBottomBar(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTopHeader() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 10, 20, 12),
      child: Column(
        children: [
          Container(
            width: 36,
            height: 4,
            decoration: BoxDecoration(
              color: AT.fillStrong,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: Row(
                  children: List.generate(_totalSteps, (idx) {
                    final active = idx == _step;
                    final passed = idx < _step;
                    return Expanded(
                      child: Padding(
                        padding: EdgeInsets.only(right: idx == _totalSteps - 1 ? 0 : 6),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 320),
                          curve: SpringCurve(),
                          height: 4,
                          decoration: BoxDecoration(
                            color: active || passed ? AT.accent : AT.fillStrong,
                            borderRadius: BorderRadius.circular(AT.rPill),
                          ),
                        ),
                      ),
                    );
                  }),
                ),
              ),
              if (widget.isEditing) ...[
                const SizedBox(width: 12),
                CircleIconButton(
                  icon: CupertinoIcons.xmark,
                  size: 30,
                  onTap: () => Navigator.of(context).pop(false),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildCurrentStep() {
    switch (_step) {
      case 0:
        return _buildWelcomeStep();
      case 1:
        return _buildLanguagesStep();
      case 2:
        return _buildGenresStep();
      case 3:
        return _buildArtistsStep();
      default:
        return const SizedBox.shrink();
    }
  }

  Widget _buildStepIntro(String title, String subtitle) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: AT.title2),
          const SizedBox(height: 6),
          Text(
            subtitle,
            style: AT.subhead.copyWith(color: AT.label2, height: 1.35),
          ),
        ],
      ),
    );
  }

  // ── Step 1: Welcome & Supported Region ────────────────────────────────────
  Widget _buildWelcomeStep() {
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(4, 4, 4, 20),
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: _buildStepIntro(
            widget.isEditing ? 'Tune your profile' : 'Welcome to Zenify',
            'Set your display name and music region. Every song on Home will start from what you choose next.',
          ),
        ),
        GroupedSection(
          title: 'PROFILE',
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              child: Row(
                children: [
                  const Icon(CupertinoIcons.person_fill, size: 18, color: AT.label2),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      controller: _nameController,
                      textCapitalization: TextCapitalization.words,
                      style: AT.body,
                      cursorColor: AT.accent,
                      decoration: InputDecoration(
                        border: InputBorder.none,
                        hintText: 'Your username',
                        hintStyle: AT.body.copyWith(color: AT.label3),
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(vertical: 10),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              child: Row(
                children: [
                  const Icon(CupertinoIcons.calendar, size: 18, color: AT.label2),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      controller: _ageController,
                      keyboardType: TextInputType.number,
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                        LengthLimitingTextInputFormatter(3),
                      ],
                      onChanged: (_) => setState(() {}),
                      style: AT.body,
                      cursorColor: AT.accent,
                      decoration: InputDecoration(
                        border: InputBorder.none,
                        hintText: 'Age (optional, 13+)',
                        hintStyle: AT.body.copyWith(color: AT.label3),
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(vertical: 10),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            AppleRow(
              leading: const Icon(CupertinoIcons.person_2_fill, size: 18, color: AT.label2),
              title: 'Gender',
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    _selectedGender ?? 'Optional',
                    style: AT.subhead.copyWith(
                      color: _selectedGender != null ? AT.label : AT.label3,
                    ),
                  ),
                  const SizedBox(width: 6),
                  const Icon(
                    CupertinoIcons.chevron_up_chevron_down,
                    size: 14,
                    color: AT.label3,
                  ),
                ],
              ),
              onTap: _pickGender,
            ),
          ],
        ),
        GroupedSection(
          title: 'REGION',
          footer: 'Auto-detected from your device. Only verified regions with full charts and new releases are listed.',
          children: [
            AppleRow(
              leading: Text(
                _selectedCountry.flag,
                style: const TextStyle(fontSize: 22),
              ),
              title: 'Music Region',
              subtitle: _selectedCountry.name,
              trailing: const Icon(
                CupertinoIcons.chevron_up_chevron_down,
                size: 15,
                color: AT.label3,
              ),
              onTap: _pickCountry,
            ),
          ],
        ),
      ],
    );
  }

  // ── Step 2: Verified Languages ────────────────────────────────────────────
  Widget _buildLanguagesStep() {
    final sorted = UserPreferencesService.sortedLanguagesForCountry(_selectedCountry.code);
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
      children: [
        _buildStepIntro(
          'Pick your languages',
          'Your region’s languages come first. Only languages we reliably fetch are shown.',
        ),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: sorted.map((lang) {
            final selected = _selectedLanguages.contains(lang.name);
            return SpringPressable(
              onTap: () => _toggleLanguage(lang.name),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                curve: Curves.easeOutCubic,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: selected ? AT.accent : AT.surfaceHi,
                  borderRadius: BorderRadius.circular(AT.rPill),
                  border: Border.all(
                    color: selected ? AT.accent : AT.hairline,
                    width: 0.8,
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (selected) ...[
                      const Icon(CupertinoIcons.checkmark_alt, size: 15, color: Colors.white),
                      const SizedBox(width: 6),
                    ],
                    Text(
                      lang.name,
                      style: AT.callout.copyWith(
                        color: selected ? Colors.white : AT.label,
                        fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      lang.nativeLabel,
                      style: AT.caption.copyWith(
                        color: selected
                            ? Colors.white.withValues(alpha: 0.85)
                            : AT.label3,
                      ),
                    ),
                  ],
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  // ── Step 3: Genres & Vibes ────────────────────────────────────────────────
  Widget _buildGenresStep() {
    final sorted = UserPreferencesService.sortedGenresForLanguages(_selectedLanguages);
    final langSummary = _selectedLanguages.take(2).join(' & ');

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
      children: [
        _buildStepIntro(
          'What sounds move you?',
          'Ordered around ${langSummary.isEmpty ? 'your choices' : langSummary}. Pick 2 or more.',
        ),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: sorted.map((genre) {
            final selected = _selectedGenres.contains(genre);
            return SpringPressable(
              onTap: () => _toggleGenre(genre),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                curve: Curves.easeOutCubic,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
                decoration: BoxDecoration(
                  color: selected ? AT.accent : AT.surfaceHi,
                  borderRadius: BorderRadius.circular(AT.rPill),
                  border: Border.all(
                    color: selected ? AT.accent : AT.hairline,
                    width: 0.8,
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (selected) ...[
                      const Icon(CupertinoIcons.checkmark_alt, size: 15, color: Colors.white),
                      const SizedBox(width: 6),
                    ],
                    Text(
                      genre,
                      style: AT.callout.copyWith(
                        color: selected ? Colors.white : AT.label,
                        fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  // ── Step 4: Favorite Artists (Curated + Live Search) ──────────────────────
  Widget _buildArtistsStep() {
    final curatedNames = UserPreferencesService.curatedArtistsForLanguages(_selectedLanguages);

    final List<OnboardingArtist> visibleArtists;
    if (_artistQuery.length >= 2) {
      visibleArtists = _searchResults
          .map((e) => OnboardingArtist(id: e.id, name: e.name, image: e.image))
          .toList();
    } else {
      visibleArtists = curatedNames.map((name) {
        final meta = _resolvedArtistMeta[name.toLowerCase()];
        return OnboardingArtist(
          id: meta?.id ?? name,
          name: name,
          image: meta?.image ?? '',
        );
      }).toList();
    }

    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
      children: [
        _buildStepIntro(
          'Pick 3+ favorite artists',
          'Start with names from your languages or search any artist below.',
        ),
        // Apple-style search bar
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            color: AT.fill,
            borderRadius: BorderRadius.circular(AT.rMd),
          ),
          child: Row(
            children: [
              const Icon(CupertinoIcons.search, size: 18, color: AT.label3),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: _artistSearchController,
                  onChanged: _onArtistQueryChanged,
                  style: AT.body,
                  cursorColor: AT.accent,
                  decoration: InputDecoration(
                    border: InputBorder.none,
                    hintText: 'Search any artist...',
                    hintStyle: AT.subhead.copyWith(color: AT.label3),
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(vertical: 11),
                  ),
                ),
              ),
              if (_artistQuery.isNotEmpty)
                GestureDetector(
                  onTap: () {
                    _artistSearchController.clear();
                    _onArtistQueryChanged('');
                  },
                  child: const Padding(
                    padding: EdgeInsets.all(4),
                    child: Icon(CupertinoIcons.xmark_circle_fill, size: 17, color: AT.label3),
                  ),
                ),
            ],
          ),
        ),
        if (_selectedArtists.isNotEmpty) ...[
          const SizedBox(height: 12),
          SizedBox(
            height: 34,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: _selectedArtists.length,
              separatorBuilder: (_, _) => const SizedBox(width: 8),
              itemBuilder: (context, idx) {
                final artist = _selectedArtists.values.elementAt(idx);
                return SpringPressable(
                  onTap: () => _toggleArtist(artist),
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
                        Text(
                          artist.name,
                          style: AT.caption.copyWith(
                            color: AT.label,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
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
        if (_searchingArtists)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 32),
            child: Center(child: CupertinoActivityIndicator(radius: 12)),
          )
        else if (visibleArtists.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 32),
            child: Center(
              child: Text(
                'No matching artists found for "$_artistQuery"',
                style: AT.subhead.copyWith(color: AT.label3),
              ),
            ),
          )
        else
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: visibleArtists.length,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              mainAxisSpacing: 14,
              crossAxisSpacing: 12,
              childAspectRatio: 0.78,
            ),
            itemBuilder: (context, index) {
              final artist = visibleArtists[index];
              final selected = _selectedArtists.containsKey(artist.name.toLowerCase());
              return SpringPressable(
                onTap: () => _toggleArtist(artist),
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
                            border: Border.all(
                              color: selected ? AT.accent : Colors.transparent,
                              width: 2.2,
                            ),
                          ),
                          child: artist.image.isNotEmpty
                              ? ClipOval(
                                  child: Image.network(
                                    artist.image,
                                    width: 74,
                                    height: 74,
                                    fit: BoxFit.cover,
                                    cacheWidth: 160,
                                    errorBuilder: (_, _, _) => Avatar(
                                      name: artist.name,
                                      size: 74,
                                    ),
                                  ),
                                )
                              : Avatar(
                                  name: artist.name,
                                  size: 74,
                                ),
                        ),
                        if (selected)
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
                              child: const Icon(
                                CupertinoIcons.checkmark_alt,
                                size: 12,
                                color: Colors.white,
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      artist.name,
                      maxLines: 2,
                      textAlign: TextAlign.center,
                      overflow: TextOverflow.ellipsis,
                      style: AT.caption.copyWith(
                        color: selected ? AT.label : AT.label2,
                        fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
      ],
    );
  }

  Widget _buildBottomBar() {
    final isLast = _step == _totalSteps - 1;
    return Container(
      decoration: BoxDecoration(
        color: AT.surface,
        border: Border(top: BorderSide(color: AT.hairline, width: 0.6)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 14),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  Text(
                    _footerHint,
                    style: AT.footnote.copyWith(
                      color: _canProceed ? AT.label2 : AT.accent,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  if (_step > 0) ...[
                    PillButton(
                      label: 'Back',
                      style: PillStyle.glass,
                      onTap: _saving ? null : _goBack,
                    ),
                    const SizedBox(width: 10),
                  ],
                  Expanded(
                    child: PillButton(
                      key: ValueKey('onboarding_next_$_step'),
                      label: isLast
                          ? (widget.isEditing ? 'Save Changes' : 'Start Listening')
                          : 'Continue',
                      style: PillStyle.filled,
                      expand: true,
                      loading: _saving,
                      onTap: _canProceed ? _goNext : () {
                        HapticFeedback.heavyImpact();
                        appleToast(context, _footerHint);
                      },
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
