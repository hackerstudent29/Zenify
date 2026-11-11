import 'dart:math' as math;
import 'dart:ui' show ImageFilter;

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../design_system/tokens/app_colors.dart';
import '../../design_system/widgets/apple_glass.dart';
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
  static const _surface = Color(0xED161619);

  int _step = 0;
  int _dir = 1;

  final _nameCtrl = TextEditingController();
  final _langCtrl = TextEditingController();
  final _genreCtrl = TextEditingController();
  final _countryCtrl = TextEditingController();
  final _nameFocus = FocusNode();

  final Set<String> _languages = {'Tamil', 'English'};
  final Set<String> _genres = {'Pop', 'Film Soundtrack'};
  String _countryCode = 'IN';

  bool _saving = false;

  late final AnimationController _prog =
      AnimationController.unbounded(vsync: this, value: 1);

  late final AnimationController _auraCtrl = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 12),
  );

  @override
  void initState() {
    super.initState();
    _nameCtrl.text = context.read<AuthState>().user?.effectiveName ?? '';
    _nameFocus.addListener(_onFocusChanged);
    final detected =
        WidgetsBinding.instance.platformDispatcher.locale.countryCode;
    if (detected != null && _countries.any((c) => c.$1 == detected)) {
      _countryCode = detected;
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _auraCtrl.stop();
    } else if (!_auraCtrl.isAnimating) {
      _auraCtrl.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _nameFocus.removeListener(_onFocusChanged);
    _nameFocus.dispose();
    _nameCtrl.dispose();
    _langCtrl.dispose();
    _genreCtrl.dispose();
    _countryCtrl.dispose();
    _prog.dispose();
    _auraCtrl.dispose();
    super.dispose();
  }

  void _onFocusChanged() {
    if (mounted) setState(() {});
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
    springTo(_prog, to + 1.0, Springs.smooth);
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
    final keyboardOpen = mq.viewInsets.bottom > 0;
    final avail = mq.size.height - mq.viewInsets.bottom - mq.padding.top - 12;
    final h = math.max(
      200.0,
      math.min(math.min(mq.size.height * 0.92, 780.0), avail),
    );
    final compactFooter = keyboardOpen && avail < 360;

    return AnimatedPadding(
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOutCubic,
      padding: EdgeInsets.only(bottom: mq.viewInsets.bottom),
      child: Center(
        heightFactor: 1.0,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOutCubic,
            height: h,
            child: ClipRRect(
              borderRadius:
                  const BorderRadius.vertical(top: Radius.circular(34)),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 30, sigmaY: 30),
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: _surface,
                    borderRadius:
                        const BorderRadius.vertical(top: Radius.circular(34)),
                    border: Border(
                      top: BorderSide(
                        color: Colors.white.withValues(alpha: 0.14),
                        width: 0.8,
                      ),
                      left: BorderSide(
                        color: Colors.white.withValues(alpha: 0.06),
                        width: 0.6,
                      ),
                      right: BorderSide(
                        color: Colors.white.withValues(alpha: 0.06),
                        width: 0.6,
                      ),
                    ),
                  ),
                  child: Stack(
                    children: [
                      // Ambient top rose aurora responding to step progress
                      Positioned(
                        top: -80,
                        left: 0,
                        right: 0,
                        child: IgnorePointer(
                          child: AnimatedBuilder(
                            animation: Listenable.merge([_prog, _auraCtrl]),
                            builder: (context, _) {
                              final shift =
                                  ((_prog.value - 1) / (_steps - 1)) * 0.35 -
                                      0.175;
                              final breath = 0.85 + 0.15 * _auraCtrl.value;
                              return Align(
                                alignment: Alignment(shift, -1),
                                child: Container(
                                  width: 280 * breath,
                                  height: 160 * breath,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    gradient: RadialGradient(
                                      colors: [
                                        AppColors.accent
                                            .withValues(alpha: 0.22),
                                        AppColors.accentMaroon
                                            .withValues(alpha: 0.08),
                                        Colors.transparent,
                                      ],
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
                      ),

                      Column(
                        children: [
                          Center(
                            child: Container(
                              width: 38,
                              height: 5,
                              margin: const EdgeInsets.only(top: 10, bottom: 12),
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.24),
                                borderRadius: BorderRadius.circular(2.5),
                              ),
                            ),
                          ),
                          _buildHeader(),
                          const SizedBox(height: 6),
                          Expanded(
                            child: AnimatedSwitcher(
                              duration: const Duration(milliseconds: 420),
                              switchInCurve:
                                  const _OnboardingSpringCurve(Springs.smooth),
                              switchOutCurve: Curves.easeInCubic,
                              layoutBuilder: (current, previous) => Stack(
                                fit: StackFit.expand,
                                children: [...previous, ?current],
                              ),
                              transitionBuilder: (child, anim) {
                                final incoming =
                                    child.key == ValueKey<int>(_step);
                                final begin = Offset(
                                  (incoming ? 0.14 : -0.14) * _dir,
                                  0,
                                );
                                return FadeTransition(
                                  opacity: anim,
                                  child: SlideTransition(
                                    position: Tween<Offset>(
                                      begin: begin,
                                      end: Offset.zero,
                                    ).animate(anim),
                                    child: ScaleTransition(
                                      scale: Tween<double>(
                                        begin: incoming ? 0.985 : 1.0,
                                        end: 1.0,
                                      ).animate(anim),
                                      child: child,
                                    ),
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
                          _buildFooter(
                            mq.padding.bottom,
                            keyboardOpen,
                            compactFooter,
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
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
                scale: 0.88,
                onTap: () => _go(_step - 1),
                child: AppleGlass(
                  borderRadius: BorderRadius.circular(18),
                  tint: Colors.white.withValues(alpha: 0.14),
                  shadow: false,
                  child: Container(
                    width: 36,
                    height: 36,
                    decoration: const BoxDecoration(shape: BoxShape.circle),
                    alignment: Alignment.center,
                    child: const Icon(
                      CupertinoIcons.chevron_back,
                      size: 18,
                      color: Colors.white,
                    ),
                  ),
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
                    if (i > 0) const SizedBox(width: 6),
                    Expanded(
                      child: Container(
                        height: 4.5,
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.14),
                          borderRadius: BorderRadius.circular(2.5),
                        ),
                        alignment: Alignment.centerLeft,
                        child: FractionallySizedBox(
                          widthFactor: (_prog.value - i).clamp(0.0, 1.0),
                          child: Container(
                            decoration: BoxDecoration(
                              gradient: const LinearGradient(
                                colors: [AppColors.accent, AppColors.crimson],
                              ),
                              borderRadius: BorderRadius.circular(2.5),
                              boxShadow: [
                                BoxShadow(
                                  color: AppColors.accent.withValues(alpha: 0.45),
                                  blurRadius: 6,
                                ),
                              ],
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
            scale: 0.94,
            onTap: () {
              HapticFeedback.selectionClick();
              widget.onCompleted();
            },
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
              child: Text(
                'Skip',
                style: TextStyle(
                  fontFamily: 'SF Pro',
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: Colors.white.withValues(alpha: 0.78),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFooter(
    double bottomInset,
    bool keyboardOpen,
    bool compactFooter,
  ) {
    final hint = switch (_step) {
      1 => '${_languages.length} selected',
      2 => _genres.length < 3
          ? 'Pick a few more for better mixes · ${_genres.length} selected'
          : '${_genres.length} selected',
      3 => '$_countryName ${_flag(_countryCode)}',
      _ => '',
    };
    final effectiveBottom =
        keyboardOpen ? 12.0 : math.max(bottomInset, 16.0) + 4.0;

    return Padding(
      padding: EdgeInsets.fromLTRB(24, 10, 24, effectiveBottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          AnimatedSize(
            duration: const Duration(milliseconds: 260),
            curve: Curves.easeOutCubic,
            child: (hint.isEmpty || compactFooter)
                ? const SizedBox(width: double.infinity)
                : Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: AnimatedSwitcher(
                      duration: const Duration(milliseconds: 220),
                      child: Text(
                        hint,
                        key: ValueKey(hint),
                        style: TextStyle(
                          fontFamily: 'SF Pro',
                          fontSize: 13.5,
                          fontWeight: FontWeight.w500,
                          color: Colors.white.withValues(alpha: 0.68),
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                    ),
                  ),
          ),
          AnimatedOpacity(
            duration: const Duration(milliseconds: 200),
            opacity: _canContinue ? 1 : 0.42,
            child: PressableScale(
              scale: 0.96,
              onTap: (_saving || !_canContinue) ? null : _next,
              child: Container(
                height: 52,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(26),
                  gradient: const LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [AppColors.accent, AppColors.crimson],
                  ),
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.18),
                    width: 0.6,
                  ),
                  boxShadow: _canContinue
                      ? [
                          BoxShadow(
                            color: AppColors.accent.withValues(alpha: 0.34),
                            blurRadius: 18,
                            offset: const Offset(0, 6),
                          ),
                        ]
                      : const [],
                ),
                child: _saving
                    ? const SizedBox(
                        width: 21,
                        height: 21,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.3,
                          color: Colors.white,
                        ),
                      )
                    : AnimatedSwitcher(
                        duration: const Duration(milliseconds: 220),
                        child: Text(
                          _step == _steps - 1 ? 'Get Started' : 'Continue',
                          key: ValueKey(_step == _steps - 1),
                          style: const TextStyle(
                            fontFamily: 'SF Pro Display',
                            fontSize: 16.5,
                            fontWeight: FontWeight.w700,
                            letterSpacing: -0.2,
                            color: Colors.white,
                          ),
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
            Text(
              title,
              style: const TextStyle(
                fontFamily: 'SF Pro Display',
                fontSize: 29,
                height: 1.12,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.8,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              subtitle,
              style: TextStyle(
                fontFamily: 'SF Pro',
                fontSize: 15,
                height: 1.35,
                fontWeight: FontWeight.w500,
                color: Colors.white.withValues(alpha: 0.72),
              ),
            ),
          ],
        ),
      );

  Widget _search(TextEditingController c, String hint) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 12),
        child: Container(
          height: 44,
          padding: const EdgeInsets.only(left: 14, right: 6),
          decoration: BoxDecoration(
            color: const Color(0xFF232328),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: Colors.white.withValues(alpha: 0.12),
              width: 0.8,
            ),
          ),
          child: Row(
            children: [
              Icon(
                CupertinoIcons.search,
                size: 18,
                color: Colors.white.withValues(alpha: 0.56),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: TextField(
                  controller: c,
                  cursorColor: AppColors.accent,
                  onChanged: (_) => setState(() {}),
                  style: const TextStyle(
                    fontFamily: 'SF Pro',
                    fontSize: 16,
                    fontWeight: FontWeight.w500,
                    color: Colors.white,
                  ),
                  decoration: InputDecoration(
                    isCollapsed: true,
                    border: InputBorder.none,
                    hintText: hint,
                    hintStyle: TextStyle(
                      fontFamily: 'SF Pro',
                      fontSize: 16,
                      fontWeight: FontWeight.w500,
                      color: Colors.white.withValues(alpha: 0.46),
                    ),
                  ),
                ),
              ),
              SpringPop(
                visible: c.text.isNotEmpty,
                child: PressableScale(
                  scale: 0.85,
                  onTap: () {
                    HapticFeedback.selectionClick();
                    setState(c.clear);
                  },
                  child: Padding(
                    padding: const EdgeInsets.all(6),
                    child: Container(
                      width: 22,
                      height: 22,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.white.withValues(alpha: 0.14),
                      ),
                      alignment: Alignment.center,
                      child: const Icon(
                        CupertinoIcons.xmark,
                        size: 11,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      );

  Widget _sectionHeader(String t) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 10, 24, 10),
        child: Text(
          t,
          style: TextStyle(
            fontFamily: 'SF Pro',
            fontSize: 13.5,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.1,
            color: Colors.white.withValues(alpha: 0.72),
          ),
        ),
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
            Icon(
              CupertinoIcons.search,
              size: 34,
              color: Colors.white.withValues(alpha: 0.34),
            ),
            const SizedBox(height: 10),
            Text(
              msg,
              style: TextStyle(
                fontFamily: 'SF Pro',
                fontSize: 15,
                fontWeight: FontWeight.w500,
                color: Colors.white.withValues(alpha: 0.72),
              ),
            ),
          ],
        ),
      );

  Widget _searchableStep({
    required String title,
    required String subtitle,
    required TextEditingController controller,
    required String searchHint,
    required List<Widget> children,
  }) =>
      ShaderMask(
        blendMode: BlendMode.dstIn,
        shaderCallback: (r) => const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Colors.black, Colors.black, Color(0x00000000)],
          stops: [0, 0.94, 1],
        ).createShader(r),
        child: CustomScrollView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          physics: const BouncingScrollPhysics(
            parent: AlwaysScrollableScrollPhysics(),
          ),
          slivers: [
            SliverToBoxAdapter(child: _title(title, subtitle)),
            SliverPersistentHeader(
              pinned: true,
              delegate: _PinnedSearchDelegate(
                stepKey: searchHint,
                query: controller.text,
                child: _search(controller, searchHint),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.only(bottom: 24),
              sliver: SliverList(
                delegate: SliverChildListDelegate(children),
              ),
            ),
          ],
        ),
      );

  // ----- step 0: name -----

  Widget _buildName() {
    final name = _nameCtrl.text.trim();
    final initial = name.isEmpty ? '♪' : name.characters.first.toUpperCase();
    final hasFocus = _nameFocus.hasFocus;

    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxHeight < 300;
        final avatarSize = compact ? 76.0 : 108.0;
        final topPad = compact ? 10.0 : 24.0;
        final gap = compact ? 16.0 : 26.0;

        return SingleChildScrollView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          physics: const BouncingScrollPhysics(),
          padding: EdgeInsets.fromLTRB(24, topPad, 24, 20),
          child: Column(
            children: [
              SpringIn(
                child: AnimatedBuilder(
                  animation: _auraCtrl,
                  builder: (context, child) {
                    final halo = avatarSize + 24 + _auraCtrl.value * 8;
                    return Stack(
                      alignment: Alignment.center,
                      children: [
                        Container(
                          width: halo,
                          height: halo,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: RadialGradient(
                              colors: [
                                AppColors.accent.withValues(
                                  alpha: 0.24 + 0.08 * _auraCtrl.value,
                                ),
                                Colors.transparent,
                              ],
                            ),
                          ),
                        ),
                        child!,
                      ],
                    );
                  },
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 220),
                    curve: Curves.easeOutCubic,
                    width: avatarSize,
                    height: avatarSize,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: const LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [Color(0xFFFB7185), AppColors.crimson],
                      ),
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.24),
                        width: 1.0,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.accent.withValues(alpha: 0.38),
                          blurRadius: 28,
                          offset: const Offset(0, 12),
                        ),
                      ],
                    ),
                    child: AnimatedSwitcher(
                      duration: const Duration(milliseconds: 300),
                      switchInCurve: Curves.easeOutBack,
                      transitionBuilder: (c, a) => ScaleTransition(
                        scale: a,
                        child: FadeTransition(opacity: a, child: c),
                      ),
                      child: Text(
                        initial,
                        key: ValueKey(initial),
                        style: TextStyle(
                          fontFamily: 'SF Pro Display',
                          fontSize: compact ? 34 : 46,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              SizedBox(height: gap),
              SpringIn(
                delayMs: 60,
                child: Text(
                  'What should we call you?',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontFamily: 'SF Pro Display',
                    fontSize: compact ? 24 : 28,
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.7,
                    height: 1.15,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              SpringIn(
                delayMs: 100,
                child: Text(
                  'This is how you appear on shared playlists and rooms.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontFamily: 'SF Pro',
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                    height: 1.35,
                    color: Colors.white.withValues(alpha: 0.72),
                  ),
                ),
              ),
              SizedBox(height: gap),
              SpringIn(
                delayMs: 140,
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 220),
                  curve: Curves.easeOutCubic,
                  height: 56,
                  padding: const EdgeInsets.only(left: 18, right: 8),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: const Color(0xFF232328),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: hasFocus
                          ? AppColors.accent.withValues(alpha: 0.85)
                          : Colors.white.withValues(alpha: 0.14),
                      width: hasFocus ? 1.4 : 0.8,
                    ),
                  ),
                  child: Row(
                    children: [
                      const SizedBox(width: 28),
                      Expanded(
                        child: TextField(
                          controller: _nameCtrl,
                          focusNode: _nameFocus,
                          textAlign: TextAlign.center,
                          textCapitalization: TextCapitalization.words,
                          textInputAction: TextInputAction.done,
                          cursorColor: AppColors.accent,
                          onChanged: (_) => setState(() {}),
                          onSubmitted: (_) => _next(),
                          style: const TextStyle(
                            fontFamily: 'SF Pro',
                            fontSize: 19,
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                          ),
                          decoration: InputDecoration(
                            isCollapsed: true,
                            border: InputBorder.none,
                            hintText: 'Your name',
                            hintStyle: TextStyle(
                              fontFamily: 'SF Pro',
                              fontSize: 19,
                              fontWeight: FontWeight.w500,
                              color: Colors.white.withValues(alpha: 0.44),
                            ),
                          ),
                        ),
                      ),
                      SizedBox(
                        width: 28,
                        child: SpringPop(
                          visible: _nameCtrl.text.isNotEmpty,
                          child: PressableScale(
                            scale: 0.85,
                            onTap: () {
                              HapticFeedback.selectionClick();
                              setState(_nameCtrl.clear);
                            },
                            child: Container(
                              width: 24,
                              height: 24,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: Colors.white.withValues(alpha: 0.14),
                              ),
                              alignment: Alignment.center,
                              child: const Icon(
                                CupertinoIcons.xmark,
                                size: 12,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
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
    return _searchableStep(
      title: 'Music languages',
      subtitle:
          'Pick every language you listen to. We\'ll tune your home, mixes and search.',
      controller: _langCtrl,
      searchHint: 'Search languages',
      children: [
        if (indian.isNotEmpty) ...[
          _sectionHeader('Indian languages'),
          _langChips(_indianLanguages, q, 0),
        ],
        if (world.isNotEmpty) ...[
          _sectionHeader('International'),
          _langChips(_worldLanguages, q, 6),
        ],
        if (indian.isEmpty && world.isEmpty) _empty('No languages found'),
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
    return _searchableStep(
      title: 'What do you love?',
      subtitle: 'Choose the genres and moods you want more of.',
      controller: _genreCtrl,
      searchHint: 'Search genres',
      children: [
        ...sections,
        if (!any) _empty('No genres found'),
      ],
    );
  }

  // ----- step 3: country -----

  Widget _buildCountry() {
    final q = _countryCtrl.text.trim();
    final list = _countries.where((c) => _match(q, [c.$2, c.$1])).toList();
    final selected = _countries.firstWhere((c) => c.$1 == _countryCode);
    return _searchableStep(
      title: 'Where are you?',
      subtitle:
          'We use your country to rank local charts, artists and search results.',
      controller: _countryCtrl,
      searchHint: 'Search countries',
      children: [
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
    vsync: this,
    value: widget.selected ? 1 : 0,
  );

  @override
  void didUpdateWidget(covariant _SelChip old) {
    super.didUpdateWidget(old);
    if (old.selected != widget.selected) {
      springTo(
        _c,
        widget.selected ? 1.0 : 0.0,
        widget.selected ? Springs.bouncy : Springs.snappy,
      );
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
      scale: 0.94,
      onTap: widget.onTap,
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, _) {
          final f = _c.value.clamp(0.0, 1.0).toDouble();
          return Transform.scale(
            scale: 1 + 0.04 * math.sin(f * math.pi),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: ShapeDecoration(
                shape: StadiumBorder(
                  side: BorderSide(
                    color: Color.lerp(
                      Colors.white.withValues(alpha: 0.12),
                      Colors.white.withValues(alpha: 0.28),
                      f,
                    )!,
                    width: 0.8,
                  ),
                ),
                color: Color.lerp(
                  const Color(0xFF232328),
                  AppColors.accent,
                  f,
                ),
                shadows: f > 0.05
                    ? [
                        BoxShadow(
                          color: AppColors.accent.withValues(alpha: 0.25 * f),
                          blurRadius: 12,
                          offset: const Offset(0, 4),
                        ),
                      ]
                    : const [],
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
                        child: Icon(
                          CupertinoIcons.checkmark_alt,
                          size: 16,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
                  if (widget.emoji.isNotEmpty) ...[
                    Text(
                      widget.emoji,
                      style: const TextStyle(
                        fontFamily: 'SF Pro',
                        fontSize: 15,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(width: 6),
                  ],
                  Text(
                    widget.label,
                    style: TextStyle(
                      fontFamily: 'SF Pro',
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: Color.lerp(
                        Colors.white.withValues(alpha: 0.86),
                        Colors.white,
                        f,
                      ),
                    ),
                  ),
                  if (widget.sub.isNotEmpty) ...[
                    const SizedBox(width: 6),
                    Text(
                      widget.sub,
                      style: TextStyle(
                        fontFamily: 'SF Pro',
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: Colors.white.withValues(alpha: 0.48 + 0.28 * f),
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
    vsync: this,
    value: widget.selected ? 1 : 0,
  );

  @override
  void didUpdateWidget(covariant _CountryRow old) {
    super.didUpdateWidget(old);
    if (old.selected != widget.selected) {
      springTo(
        _c,
        widget.selected ? 1.0 : 0.0,
        widget.selected ? Springs.bouncy : Springs.snappy,
      );
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
      scale: 0.98,
      onTap: widget.onTap,
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, _) {
          final f = _c.value.clamp(0.0, 1.0).toDouble();
          return Container(
            height: 54,
            margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 3),
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: ShapeDecoration(
              shape: ContinuousRectangleBorder(
                borderRadius: BorderRadius.circular(28),
                side: BorderSide(
                  color: AppColors.accent.withValues(alpha: 0.32 * f),
                  width: 0.8,
                ),
              ),
              color: Color.lerp(
                const Color(0x00FFFFFF),
                AppColors.accent.withValues(alpha: 0.18),
                f,
              ),
            ),
            child: Row(
              children: [
                Text(
                  widget.flag,
                  style: const TextStyle(
                    fontFamily: 'SF Pro',
                    fontSize: 25,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Text(
                    widget.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontFamily: 'SF Pro',
                      fontSize: 16,
                      fontWeight: FontWeight.lerp(
                        FontWeight.w500,
                        FontWeight.w700,
                        f,
                      ),
                      color: Colors.white,
                    ),
                  ),
                ),
                Transform.scale(
                  scale: _c.value.clamp(0.0, 1.2),
                  child: Opacity(
                    opacity: f,
                    child: const Icon(
                      CupertinoIcons.checkmark_circle_fill,
                      size: 22,
                      color: AppColors.accent,
                    ),
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

/// Curve driven by a physical SpringDescription from `spring_kit.dart`.
class _OnboardingSpringCurve extends Curve {
  const _OnboardingSpringCurve(this.description);

  final SpringDescription description;

  @override
  double transformInternal(double t) {
    final sim = SpringSimulation(description, 0, 1, 0);
    return sim.x(t * 0.85).clamp(0.0, 1.0);
  }
}

class _PinnedSearchDelegate extends SliverPersistentHeaderDelegate {
  const _PinnedSearchDelegate({
    required this.stepKey,
    required this.query,
    required this.child,
  });

  final String stepKey;
  final String query;
  final Widget child;

  static const double _height = 56.0;

  @override
  double get minExtent => _height;

  @override
  double get maxExtent => _height;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    return SizedBox(
      height: _height,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: overlapsContent
                ? const [
                    Color(0xF5141418),
                    Color(0xE6141418),
                    Color(0x00141418),
                  ]
                : const [
                    Color(0x00141418),
                    Color(0x00141418),
                    Color(0x00141418),
                  ],
            stops: const [0, 0.82, 1],
          ),
        ),
        child: child,
      ),
    );
  }

  @override
  bool shouldRebuild(covariant _PinnedSearchDelegate oldDelegate) =>
      oldDelegate.stepKey != stepKey || oldDelegate.query != query;
}
