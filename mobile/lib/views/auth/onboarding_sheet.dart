import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import '../../design_system/tokens/app_colors.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../design_system/widgets/spring_kit.dart';
import '../../services/auth_state.dart';
import '../../services/dock_visibility.dart';

// ---------------------------------------------------------------------------
// Result passed to onSave
// ---------------------------------------------------------------------------

class OnboardingPrefs {
  const OnboardingPrefs({
    required this.displayName,
    required this.languages,
    required this.genres,
    required this.country,
    required this.countryCode,
  });
  final String displayName;
  final List<String> languages;
  final List<String> genres;
  final String country;
  final String countryCode;

  Map<String, dynamic> toJson() => {
        'languages': languages,
        'preferredGenres': genres,
        'country': country,
        'countryCode': countryCode,
        'onboardingCompleted': true,
      };
}

// ---------------------------------------------------------------------------
// Catalog data (YT Music style: wide language / genre / country coverage)
// ---------------------------------------------------------------------------

class _L {
  const _L(this.name, [this.native = '']);
  final String name;
  final String native;
}

const _indianLanguages = <_L>[
  _L('Hindi', 'हिन्दी'),
  _L('Tamil', 'தமிழ்'),
  _L('Telugu', 'తెలుగు'),
  _L('Malayalam', 'മലയാളം'),
  _L('Kannada', 'ಕನ್ನಡ'),
  _L('Bengali', 'বাংলা'),
  _L('Marathi', 'मराठी'),
  _L('Gujarati', 'ગુજરાતી'),
  _L('Punjabi', 'ਪੰਜਾਬੀ'),
  _L('Bhojpuri', 'भोजपुरी'),
  _L('Haryanvi', 'हरियाणवी'),
  _L('Rajasthani', 'राजस्थानी'),
  _L('Odia', 'ଓଡ଼ିଆ'),
  _L('Assamese', 'অসমীয়া'),
  _L('Urdu', 'اردو'),
  _L('Nepali', 'नेपाली'),
  _L('Sanskrit', 'संस्कृत'),
  _L('Sinhala', 'සිංහල'),
];

const _worldLanguages = <_L>[
  _L('English'),
  _L('Spanish', 'Español'),
  _L('Portuguese', 'Português'),
  _L('French', 'Français'),
  _L('German', 'Deutsch'),
  _L('Italian', 'Italiano'),
  _L('Dutch', 'Nederlands'),
  _L('Russian', 'Русский'),
  _L('Ukrainian', 'Українська'),
  _L('Polish', 'Polski'),
  _L('Turkish', 'Türkçe'),
  _L('Greek', 'Ελληνικά'),
  _L('Swedish', 'Svenska'),
  _L('Norwegian', 'Norsk'),
  _L('Danish', 'Dansk'),
  _L('Finnish', 'Suomi'),
  _L('Czech', 'Čeština'),
  _L('Romanian', 'Română'),
  _L('Hungarian', 'Magyar'),
  _L('Arabic', 'العربية'),
  _L('Hebrew', 'עברית'),
  _L('Persian', 'فارسی'),
  _L('Japanese', '日本語'),
  _L('Korean', '한국어'),
  _L('Chinese (Mandarin)', '中文'),
  _L('Cantonese', '粵語'),
  _L('Indonesian', 'Bahasa Indonesia'),
  _L('Malay', 'Bahasa Melayu'),
  _L('Thai', 'ไทย'),
  _L('Vietnamese', 'Tiếng Việt'),
  _L('Filipino', 'Tagalog'),
  _L('Burmese', 'မြန်မာ'),
  _L('Khmer', 'ខ្មែរ'),
  _L('Swahili', 'Kiswahili'),
  _L('Afrikaans'),
];

class _G {
  const _G(this.name, this.emoji);
  final String name;
  final String emoji;
}

const _genreGroups = <(String, List<_G>)>[
  (
    'Popular',
    [
      _G('Pop', '🎤'),
      _G('Film Soundtrack', '🎬'),
      _G('Hip-Hop & Rap', '🎧'),
      _G('Rock', '🎸'),
      _G('Indie', '🌿'),
      _G('Alternative', '🌀'),
      _G('R&B & Soul', '🎙️'),
      _G('EDM', '🪩'),
      _G('Dance', '💃'),
      _G('Electronic', '🎛️'),
      _G('Acoustic', '🪕'),
      _G('Singer-Songwriter', '🎶'),
    ]
  ),
  (
    'Indian & Traditional',
    [
      _G('Carnatic', '🪘'),
      _G('Hindustani Classical', '🪈'),
      _G('Devotional', '🙏'),
      _G('Ghazal', '🌹'),
      _G('Qawwali & Sufi', '🕊️'),
      _G('Folk', '🪗'),
      _G('Bhangra', '🥁'),
      _G('Gaana & Kuthu', '🔥'),
      _G('Indie India', '🏔️'),
      _G('Classical', '🎻'),
    ]
  ),
  (
    'World',
    [
      _G('K-Pop', '💜'),
      _G('J-Pop', '🌸'),
      _G('C-Pop', '🏮'),
      _G('Latin', '🌶️'),
      _G('Reggaeton', '🌴'),
      _G('Afrobeats', '🌍'),
      _G('Reggae', '🟢'),
      _G('Dancehall', '🏝️'),
      _G('Country', '🤠'),
      _G('Jazz', '🎷'),
      _G('Blues', '🔵'),
      _G('Gospel', '⛪'),
      _G('Metal', '🤘'),
      _G('Punk', '⚡'),
      _G('Funk', '🕺'),
      _G('Disco', '✨'),
      _G('House', '🏠'),
      _G('Techno', '🔊'),
    ]
  ),
  (
    'Mood & Activity',
    [
      _G('Chill', '☕'),
      _G('Lo-fi', '🌙'),
      _G('Romance', '❤️'),
      _G('Party', '🎉'),
      _G('Workout', '💪'),
      _G('Focus', '🎯'),
      _G('Sleep', '😴'),
      _G('Road Trip', '🚗'),
      _G('Sad & Heartbreak', '💔'),
      _G('Motivation', '🚀'),
      _G('Ambient', '🌫️'),
      _G('Instrumental', '🎹'),
      _G('Kids & Family', '🧸'),
    ]
  ),
];

const _countries = <(String, String)>[
  ('DZ', 'Algeria'), ('AR', 'Argentina'), ('AU', 'Australia'),
  ('AT', 'Austria'), ('AZ', 'Azerbaijan'), ('BH', 'Bahrain'),
  ('BD', 'Bangladesh'), ('BY', 'Belarus'), ('BE', 'Belgium'),
  ('BT', 'Bhutan'), ('BO', 'Bolivia'), ('BA', 'Bosnia & Herzegovina'),
  ('BR', 'Brazil'), ('BG', 'Bulgaria'), ('KH', 'Cambodia'),
  ('CA', 'Canada'), ('CL', 'Chile'), ('CO', 'Colombia'),
  ('CR', 'Costa Rica'), ('HR', 'Croatia'), ('CY', 'Cyprus'),
  ('CZ', 'Czechia'), ('DK', 'Denmark'), ('DO', 'Dominican Republic'),
  ('EC', 'Ecuador'), ('EG', 'Egypt'), ('SV', 'El Salvador'),
  ('EE', 'Estonia'), ('FI', 'Finland'), ('FR', 'France'),
  ('GE', 'Georgia'), ('DE', 'Germany'), ('GH', 'Ghana'),
  ('GR', 'Greece'), ('GT', 'Guatemala'), ('HN', 'Honduras'),
  ('HK', 'Hong Kong'), ('HU', 'Hungary'), ('IS', 'Iceland'),
  ('IN', 'India'), ('ID', 'Indonesia'), ('IQ', 'Iraq'),
  ('IE', 'Ireland'), ('IL', 'Israel'), ('IT', 'Italy'),
  ('JM', 'Jamaica'), ('JP', 'Japan'), ('JO', 'Jordan'),
  ('KZ', 'Kazakhstan'), ('KE', 'Kenya'), ('KW', 'Kuwait'),
  ('LA', 'Laos'), ('LV', 'Latvia'), ('LB', 'Lebanon'),
  ('LY', 'Libya'), ('LI', 'Liechtenstein'), ('LT', 'Lithuania'),
  ('LU', 'Luxembourg'), ('MY', 'Malaysia'), ('MV', 'Maldives'),
  ('MT', 'Malta'), ('MU', 'Mauritius'), ('MX', 'Mexico'),
  ('ME', 'Montenegro'), ('MA', 'Morocco'), ('MM', 'Myanmar'),
  ('NP', 'Nepal'), ('NL', 'Netherlands'), ('NZ', 'New Zealand'),
  ('NI', 'Nicaragua'), ('NG', 'Nigeria'), ('MK', 'North Macedonia'),
  ('NO', 'Norway'), ('OM', 'Oman'), ('PK', 'Pakistan'),
  ('PA', 'Panama'), ('PY', 'Paraguay'), ('PE', 'Peru'),
  ('PH', 'Philippines'), ('PL', 'Poland'), ('PT', 'Portugal'),
  ('PR', 'Puerto Rico'), ('QA', 'Qatar'), ('RO', 'Romania'),
  ('RU', 'Russia'), ('SA', 'Saudi Arabia'), ('SN', 'Senegal'),
  ('RS', 'Serbia'), ('SG', 'Singapore'), ('SK', 'Slovakia'),
  ('SI', 'Slovenia'), ('ZA', 'South Africa'), ('KR', 'South Korea'),
  ('ES', 'Spain'), ('LK', 'Sri Lanka'), ('SE', 'Sweden'),
  ('CH', 'Switzerland'), ('TW', 'Taiwan'), ('TZ', 'Tanzania'),
  ('TH', 'Thailand'), ('TN', 'Tunisia'), ('TR', 'Türkiye'),
  ('UG', 'Uganda'), ('UA', 'Ukraine'), ('AE', 'United Arab Emirates'),
  ('GB', 'United Kingdom'), ('US', 'United States'), ('UY', 'Uruguay'),
  ('VE', 'Venezuela'), ('VN', 'Vietnam'), ('YE', 'Yemen'),
  ('ZW', 'Zimbabwe'),
];

String _flag(String code) => String.fromCharCodes(
    code.toUpperCase().codeUnits.map((c) => 0x1F1E6 + c - 0x41));

bool _match(String q, List<String> fields) {
  if (q.isEmpty) return true;
  final s = q.toLowerCase();
  return fields.any((f) => f.toLowerCase().contains(s));
}

// ---------------------------------------------------------------------------
// Sheet
// ---------------------------------------------------------------------------

/// Apple Music style onboarding. Show with
/// `showModalBottomSheet(isScrollControlled: true, backgroundColor: Colors.transparent, ...)`.
///
/// Steps: 0 name · 1 languages · 2 genres · 3 country.
/// Pass [onSave] to persist the preferences (server / local DB).
class OnboardingSheet extends StatefulWidget {
  const OnboardingSheet({super.key, required this.onCompleted, this.onSave});

  final VoidCallback onCompleted;
  final Future<void> Function(OnboardingPrefs prefs)? onSave;

  @override
  State<OnboardingSheet> createState() => _OnboardingSheetState();
}

class _OnboardingSheetState extends State<OnboardingSheet>
    with TickerProviderStateMixin, HideDocksMixin {
  static const _steps = 4;
  static const _surface = Color(0xFF1C1C1E);
  static const _fill = Color(0x1FFFFFFF);

  int _step = 0;
  int _dir = 1;

  final _nameCtrl = TextEditingController();
  final _langCtrl = TextEditingController();
  final _genreCtrl = TextEditingController();
  final _countryCtrl = TextEditingController();

  final Set<String> _languages = {'Tamil', 'English'};
  final Set<String> _genres = {'Pop', 'Film Soundtrack'};
  String _countryCode = 'IN';

  bool _saving = false;

  late final AnimationController _prog =
      AnimationController.unbounded(vsync: this, value: 1);

  @override
  void initState() {
    super.initState();
    _nameCtrl.text = context.read<AuthState>().user?.effectiveName ?? '';
    final detected =
        WidgetsBinding.instance.platformDispatcher.locale.countryCode;
    if (detected != null && _countries.any((c) => c.$1 == detected)) {
      _countryCode = detected;
    }
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _langCtrl.dispose();
    _genreCtrl.dispose();
    _countryCtrl.dispose();
    _prog.dispose();
    super.dispose();
  }

  String get _countryName =>
      _countries.firstWhere((c) => c.$1 == _countryCode).$2;

  bool get _canContinue => switch (_step) {
        1 => _languages.isNotEmpty,
        _ => true,
      };

  void _go(int to) {
    if (to < 0 || to >= _steps || to == _step) return;
    FocusManager.instance.primaryFocus?.unfocus();
    HapticFeedback.selectionClick();
    setState(() {
      _dir = to > _step ? 1 : -1;
      _step = to;
    });
    springTo(_prog, to + 1.0, Springs.snappy);
  }

  Future<void> _finish() async {
    if (_saving) return;
    HapticFeedback.mediumImpact();
    setState(() => _saving = true);
    final name = _nameCtrl.text.trim();
    try {
      if (name.isNotEmpty) {
        await context
            .read<AuthState>()
            .updateProfile(displayName: name, name: name);
      }
    } catch (_) {}
    try {
      await widget.onSave?.call(OnboardingPrefs(
        displayName: name,
        languages: _languages.toList(),
        genres: _genres.toList(),
        country: _countryName,
        countryCode: _countryCode,
      ));
    } catch (_) {}
    if (mounted) widget.onCompleted();
  }

  void _next() => _step < _steps - 1 ? _go(_step + 1) : _finish();

  void _toggle(Set<String> set, String v, {int min = 0}) {
    HapticFeedback.selectionClick();
    setState(() {
      if (set.contains(v)) {
        if (set.length > min) set.remove(v);
      } else {
        set.add(v);
      }
    });
  }

  // ----- build -----

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final h = math.min(mq.size.height * 0.92, 780.0);

    return AnimatedPadding(
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOutCubic,
      padding: EdgeInsets.only(bottom: mq.viewInsets.bottom),
      child: Container(
        height: h,
        decoration: const ShapeDecoration(
          color: _surface,
          shape: ContinuousRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(56)),
          ),
        ),
        child: Column(
          children: [
            Center(
              child: Container(
                width: 38,
                height: 5,
                margin: const EdgeInsets.only(top: 10, bottom: 14),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.22),
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
            ),
            _buildHeader(),
            const SizedBox(height: 8),
            Expanded(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 420),
                switchInCurve: Curves.easeOutCubic,
                switchOutCurve: Curves.easeInCubic,
                layoutBuilder: (current, previous) => Stack(
                  fit: StackFit.expand,
                  children: [...previous, ?current],
                ),
                transitionBuilder: (child, anim) {
                  final incoming = child.key == ValueKey<int>(_step);
                  final begin = Offset((incoming ? 0.14 : -0.14) * _dir, 0);
                  return FadeTransition(
                    opacity: anim,
                    child: SlideTransition(
                      position:
                          Tween(begin: begin, end: Offset.zero).animate(anim),
                      child: child,
                    ),
                  );
                },
                child: KeyedSubtree(
                  key: ValueKey<int>(_step),
                  child: switch (_step) {
                    0 => _buildName(),
                    1 => _buildLanguages(),
                    2 => _buildGenres(),
                    _ => _buildCountry(),
                  },
                ),
              ),
            ),
            _buildFooter(mq.padding.bottom),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(
        children: [
          AnimatedOpacity(
            duration: const Duration(milliseconds: 220),
            opacity: _step > 0 ? 1 : 0,
            child: IgnorePointer(
              ignoring: _step == 0,
              child: PressableScale(
                onTap: () => _go(_step - 1),
                child: Container(
                  width: 34,
                  height: 34,
                  decoration:
                      const BoxDecoration(shape: BoxShape.circle, color: _fill),
                  child: const Icon(Icons.chevron_left_rounded,
                      size: 24, color: Colors.white),
                ),
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: AnimatedBuilder(
              animation: _prog,
              builder: (context, _) => Row(
                children: [
                  for (var i = 0; i < _steps; i++) ...[
                    if (i > 0) const SizedBox(width: 5),
                    Expanded(
                      child: Container(
                        height: 4,
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.14),
                          borderRadius: BorderRadius.circular(2),
                        ),
                        alignment: Alignment.centerLeft,
                        child: FractionallySizedBox(
                          widthFactor: (_prog.value - i).clamp(0.0, 1.0),
                          child: Container(
                            decoration: BoxDecoration(
                              color: AppColors.accent,
                              borderRadius: BorderRadius.circular(2),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(width: 14),
          PressableScale(
            onTap: widget.onCompleted,
            child: Padding(
              padding: const EdgeInsets.all(4),
              child: Text('Skip',
                  style: GoogleFonts.inter(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: Colors.white.withValues(alpha: 0.55))),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFooter(double bottomInset) {
    final hint = switch (_step) {
      1 => '${_languages.length} selected',
      2 => _genres.length < 3
          ? 'Pick a few more for better mixes · ${_genres.length} selected'
          : '${_genres.length} selected',
      3 => '$_countryName ${_flag(_countryCode)}',
      _ => '',
    };
    return Padding(
      padding: EdgeInsets.fromLTRB(24, 10, 24, math.max(bottomInset, 16)),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          AnimatedSize(
            duration: const Duration(milliseconds: 260),
            curve: Curves.easeOutCubic,
            child: hint.isEmpty
                ? const SizedBox(width: double.infinity)
                : Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: AnimatedSwitcher(
                      duration: const Duration(milliseconds: 220),
                      child: Text(
                        hint,
                        key: ValueKey(hint),
                        style: GoogleFonts.inter(
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                            color: Colors.white.withValues(alpha: 0.5)),
                      ),
                    ),
                  ),
          ),
          AnimatedOpacity(
            duration: const Duration(milliseconds: 200),
            opacity: _canContinue ? 1 : 0.4,
            child: PressableScale(
              onTap: (_saving || !_canContinue) ? null : _next,
              child: Container(
                height: 54,
                alignment: Alignment.center,
                decoration: const ShapeDecoration(
                  shape: StadiumBorder(),
                  color: AppColors.accent,
                ),
                child: _saving
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                            strokeWidth: 2.4, color: Colors.white))
                    : AnimatedSwitcher(
                        duration: const Duration(milliseconds: 220),
                        child: Text(
                          _step == _steps - 1 ? 'Get Started' : 'Continue',
                          key: ValueKey(_step == _steps - 1),
                          style: GoogleFonts.inter(
                              fontSize: 17,
                              fontWeight: FontWeight.w600,
                              color: Colors.white),
                        ),
                      ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ----- shared pieces -----

  Widget _title(String title, String subtitle) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 8, 24, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title,
                style: GoogleFonts.inter(
                    fontSize: 30,
                    height: 1.1,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.8,
                    color: Colors.white)),
            const SizedBox(height: 8),
            Text(subtitle,
                style: GoogleFonts.inter(
                    fontSize: 15,
                    height: 1.3,
                    color: Colors.white.withValues(alpha: 0.55))),
          ],
        ),
      );

  Widget _search(TextEditingController c, String hint) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 12),
        child: Container(
          height: 42,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: ShapeDecoration(
            color: _fill,
            shape: ContinuousRectangleBorder(
                borderRadius: BorderRadius.circular(26)),
          ),
          child: Row(
            children: [
              const Icon(Icons.search_rounded, size: 20, color: Colors.white54),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: c,
                  cursorColor: AppColors.accent,
                  onChanged: (_) => setState(() {}),
                  style: GoogleFonts.inter(fontSize: 16, color: Colors.white),
                  decoration: InputDecoration(
                    isCollapsed: true,
                    border: InputBorder.none,
                    hintText: hint,
                    hintStyle: GoogleFonts.inter(
                        fontSize: 16, color: Colors.white54),
                  ),
                ),
              ),
              if (c.text.isNotEmpty)
                GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => setState(c.clear),
                  child: const Padding(
                    padding: EdgeInsets.only(left: 6),
                    child: Icon(Icons.cancel_rounded,
                        size: 18, color: Colors.white54),
                  ),
                ),
            ],
          ),
        ),
      );

  Widget _sectionHeader(String t) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 10, 24, 10),
        child: Text(t,
            style: GoogleFonts.inter(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.2,
                color: Colors.white.withValues(alpha: 0.45))),
      );

  Widget _chipWrap(List<Widget> chips) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: AnimatedSize(
          duration: const Duration(milliseconds: 320),
          curve: Curves.easeOutCubic,
          alignment: Alignment.topCenter,
          child: Wrap(spacing: 8, runSpacing: 10, children: chips),
        ),
      );

  Widget _empty(String msg) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 48),
        child: Column(
          children: [
            Icon(Icons.search_off_rounded,
                size: 36, color: Colors.white.withValues(alpha: 0.3)),
            const SizedBox(height: 10),
            Text(msg,
                style: GoogleFonts.inter(
                    fontSize: 15, color: Colors.white.withValues(alpha: 0.5))),
          ],
        ),
      );

  Widget _scrollArea(List<Widget> children) => ShaderMask(
        blendMode: BlendMode.dstIn,
        shaderCallback: (r) => const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Colors.black, Colors.black, Color(0x00000000)],
          stops: [0, 0.94, 1],
        ).createShader(r),
        child: ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          physics: const BouncingScrollPhysics(
              parent: AlwaysScrollableScrollPhysics()),
          padding: const EdgeInsets.only(bottom: 24),
          children: children,
        ),
      );

  // ----- step 0: name -----

  Widget _buildName() {
    final name = _nameCtrl.text.trim();
    final initial = name.isEmpty ? '♪' : name.characters.first.toUpperCase();
    return SingleChildScrollView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(24, 24, 24, 24),
      child: Column(
        children: [
          SpringIn(
            child: Container(
              width: 112,
              height: 112,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0xFFFB7185), Color(0xFFE11D48)],
                ),
                boxShadow: [
                  BoxShadow(
                      color: AppColors.accent.withValues(alpha: 0.35),
                      blurRadius: 30,
                      offset: const Offset(0, 12)),
                ],
              ),
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 320),
                switchInCurve: Curves.easeOutBack,
                transitionBuilder: (c, a) =>
                    ScaleTransition(scale: a, child: FadeTransition(opacity: a, child: c)),
                child: Text(initial,
                    key: ValueKey(initial),
                    style: GoogleFonts.inter(
                        fontSize: 48,
                        fontWeight: FontWeight.w700,
                        color: Colors.white)),
              ),
            ),
          ),
          const SizedBox(height: 28),
          SpringIn(
            delayMs: 60,
            child: Text('What should we call you?',
                textAlign: TextAlign.center,
                style: GoogleFonts.inter(
                    fontSize: 28,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.7,
                    color: Colors.white)),
          ),
          const SizedBox(height: 8),
          SpringIn(
            delayMs: 100,
            child: Text(
                'This is how you appear on shared playlists and rooms.',
                textAlign: TextAlign.center,
                style: GoogleFonts.inter(
                    fontSize: 15,
                    color: Colors.white.withValues(alpha: 0.55))),
          ),
          const SizedBox(height: 28),
          SpringIn(
            delayMs: 140,
            child: Container(
              height: 58,
              padding: const EdgeInsets.symmetric(horizontal: 18),
              alignment: Alignment.center,
              decoration: ShapeDecoration(
                color: _fill,
                shape: ContinuousRectangleBorder(
                    borderRadius: BorderRadius.circular(30)),
              ),
              child: TextField(
                controller: _nameCtrl,
                textAlign: TextAlign.center,
                textCapitalization: TextCapitalization.words,
                textInputAction: TextInputAction.done,
                cursorColor: AppColors.accent,
                onChanged: (_) => setState(() {}),
                onSubmitted: (_) => _next(),
                style: GoogleFonts.inter(
                    fontSize: 20,
                    fontWeight: FontWeight.w600,
                    color: Colors.white),
                decoration: InputDecoration(
                  isCollapsed: true,
                  border: InputBorder.none,
                  hintText: 'Your name',
                  hintStyle: GoogleFonts.inter(
                      fontSize: 20,
                      fontWeight: FontWeight.w600,
                      color: Colors.white.withValues(alpha: 0.28)),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ----- step 1: languages -----

  Widget _langChips(List<_L> list, String q, int offset) {
    final f = list.where((l) => _match(q, [l.name, l.native])).toList();
    return _chipWrap([
      for (var i = 0; i < f.length; i++)
        SpringIn(
          key: ValueKey('lc-${f[i].name}'),
          delayMs: math.min(i + offset, 22) * 16,
          rise: 10,
          child: _SelChip(
            label: f[i].name,
            sub: f[i].native,
            selected: _languages.contains(f[i].name),
            onTap: () => _toggle(_languages, f[i].name, min: 0),
          ),
        ),
    ]);
  }

  Widget _buildLanguages() {
    final q = _langCtrl.text.trim();
    final indian = _indianLanguages.where((l) => _match(q, [l.name, l.native]));
    final world = _worldLanguages.where((l) => _match(q, [l.name, l.native]));
    return Column(
      children: [
        _title('Music languages',
            'Pick every language you listen to. We\'ll tune your home, mixes and search.'),
        _search(_langCtrl, 'Search languages'),
        Expanded(
          child: _scrollArea([
            if (indian.isNotEmpty) ...[
              _sectionHeader('Indian languages'),
              _langChips(_indianLanguages, q, 0),
            ],
            if (world.isNotEmpty) ...[
              _sectionHeader('International'),
              _langChips(_worldLanguages, q, 6),
            ],
            if (indian.isEmpty && world.isEmpty) _empty('No languages found'),
          ]),
        ),
      ],
    );
  }

  // ----- step 2: genres -----

  Widget _buildGenres() {
    final q = _genreCtrl.text.trim();
    var any = false;
    final sections = <Widget>[];
    var idx = 0;
    for (final (title, items) in _genreGroups) {
      final f = items.where((g) => _match(q, [g.name])).toList();
      if (f.isEmpty) continue;
      any = true;
      sections.add(_sectionHeader(title));
      sections.add(_chipWrap([
        for (final g in f)
          SpringIn(
            key: ValueKey('gc-${g.name}'),
            delayMs: math.min(idx++, 22) * 16,
            rise: 10,
            child: _SelChip(
              label: g.name,
              emoji: g.emoji,
              selected: _genres.contains(g.name),
              onTap: () => _toggle(_genres, g.name),
            ),
          ),
      ]));
    }
    return Column(
      children: [
        _title('What do you love?',
            'Choose the genres and moods you want more of.'),
        _search(_genreCtrl, 'Search genres'),
        Expanded(
          child: _scrollArea([
            ...sections,
            if (!any) _empty('No genres found'),
          ]),
        ),
      ],
    );
  }

  // ----- step 3: country -----

  Widget _buildCountry() {
    final q = _countryCtrl.text.trim();
    final list = _countries.where((c) => _match(q, [c.$2, c.$1])).toList();
    final selected = _countries.firstWhere((c) => c.$1 == _countryCode);
    return Column(
      children: [
        _title('Where are you?',
            'We use your country to rank local charts, artists and search results.'),
        _search(_countryCtrl, 'Search countries'),
        Expanded(
          child: _scrollArea([
            if (q.isEmpty) ...[
              _sectionHeader('Selected'),
              _CountryRow(
                key: ValueKey('cs-${selected.$1}'),
                flag: _flag(selected.$1),
                name: selected.$2,
                selected: true,
                onTap: () {},
              ),
              _sectionHeader('All countries & regions'),
            ],
            for (final c in list)
              _CountryRow(
                key: ValueKey('c-${c.$1}'),
                flag: _flag(c.$1),
                name: c.$2,
                selected: c.$1 == _countryCode,
                onTap: () {
                  HapticFeedback.selectionClick();
                  setState(() => _countryCode = c.$1);
                },
              ),
            if (list.isEmpty) _empty('No countries found'),
          ]),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Spring selectable chip
// ---------------------------------------------------------------------------

class _SelChip extends StatefulWidget {
  const _SelChip({
    required this.label,
    required this.selected,
    required this.onTap,
    this.sub = '',
    this.emoji = '',
  });
  final String label;
  final String sub;
  final String emoji;
  final bool selected;
  final VoidCallback onTap;

  @override
  State<_SelChip> createState() => _SelChipState();
}

class _SelChipState extends State<_SelChip> with TickerProviderStateMixin {
  late final AnimationController _c = AnimationController.unbounded(
      vsync: this, value: widget.selected ? 1 : 0);

  @override
  void didUpdateWidget(covariant _SelChip old) {
    super.didUpdateWidget(old);
    if (old.selected != widget.selected) {
      springTo(_c, widget.selected ? 1.0 : 0.0, Springs.snappy);
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return PressableScale(
      onTap: widget.onTap,
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, _) {
          final f = _c.value.clamp(0.0, 1.0).toDouble();
          return Transform.scale(
            scale: 1 + 0.05 * math.sin(f * math.pi),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: ShapeDecoration(
                shape: const StadiumBorder(),
                color: Color.lerp(
                    const Color(0x1FFFFFFF), AppColors.accent, f),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ClipRect(
                    child: Align(
                      alignment: Alignment.centerLeft,
                      widthFactor: f,
                      child: const Padding(
                        padding: EdgeInsets.only(right: 6),
                        child: Icon(Icons.check_rounded,
                            size: 17, color: Colors.white),
                      ),
                    ),
                  ),
                  if (widget.emoji.isNotEmpty) ...[
                    Text(widget.emoji, style: const TextStyle(fontSize: 15)),
                    const SizedBox(width: 6),
                  ],
                  Text(
                    widget.label,
                    style: GoogleFonts.inter(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: Color.lerp(Colors.white70, Colors.white, f),
                    ),
                  ),
                  if (widget.sub.isNotEmpty) ...[
                    const SizedBox(width: 6),
                    Text(
                      widget.sub,
                      style: GoogleFonts.inter(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: Colors.white
                            .withValues(alpha: 0.38 + 0.3 * f),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Country row
// ---------------------------------------------------------------------------

class _CountryRow extends StatefulWidget {
  const _CountryRow({
    super.key,
    required this.flag,
    required this.name,
    required this.selected,
    required this.onTap,
  });
  final String flag;
  final String name;
  final bool selected;
  final VoidCallback onTap;

  @override
  State<_CountryRow> createState() => _CountryRowState();
}

class _CountryRowState extends State<_CountryRow>
    with TickerProviderStateMixin {
  late final AnimationController _c = AnimationController.unbounded(
      vsync: this, value: widget.selected ? 1 : 0);

  @override
  void didUpdateWidget(covariant _CountryRow old) {
    super.didUpdateWidget(old);
    if (old.selected != widget.selected) {
      springTo(_c, widget.selected ? 1.0 : 0.0, Springs.snappy);
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return PressableScale(
      onTap: widget.onTap,
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, _) {
          final f = _c.value.clamp(0.0, 1.0).toDouble();
          return Container(
            height: 54,
            margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: ShapeDecoration(
              shape: ContinuousRectangleBorder(
                  borderRadius: BorderRadius.circular(28)),
              color: Color.lerp(const Color(0x00FFFFFF),
                  AppColors.accent.withValues(alpha: 0.2), f),
            ),
            child: Row(
              children: [
                Text(widget.flag, style: const TextStyle(fontSize: 26)),
                const SizedBox(width: 14),
                Expanded(
                  child: Text(
                    widget.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.inter(
                      fontSize: 16,
                      fontWeight: FontWeight.lerp(
                          FontWeight.w500, FontWeight.w700, f),
                      color: Colors.white,
                    ),
                  ),
                ),
                Transform.scale(
                  scale: _c.value.clamp(0.0, 1.2),
                  child: Opacity(
                    opacity: f,
                    child: const Icon(Icons.check_circle_rounded,
                        size: 24, color: AppColors.accent),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}