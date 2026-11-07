const fs = require('fs');
let s = fs.readFileSync('D:/.gemini/Zenify/mobile/lib/views/home/home_screen.dart', 'utf8');

// 1. Add imports
s = s.replace(
  "import '../profile/profile_screen.dart';",
  "import '../profile/profile_screen.dart';\nimport '../../services/country_service.dart';\nimport '../../services/listening_history_service.dart';\nimport '../../services/innertube_service.dart';\nimport '../../services/api_service.dart';"
);

// 2. Replace HomeScreenState
const oldStateStart = "class _HomeScreenState extends State<HomeScreen> {";
const oldStateEnd = "  Widget build(BuildContext context) {";

const newState = `class _HomeScreenState extends State<HomeScreen> {
  int _mood = -1;
  int _refresh = 0;
  bool _loading = true;

  List<Track> _quickPicks = [];
  List<Track> _chartTracks = [];
  List<({String name, String subs, String image})> _chartArtists = [];
  List<Track> _newReleases = [];
  List<Track> _recentHistory = [];
  String? _favoriteArtist;
  List<Track> _favoriteArtistTracks = [];

  @override
  void initState() {
    super.initState();
    CountryService.instance.countryNotifier.addListener(_onCountryChanged);
    ListeningHistoryService.instance.historyNotifier.addListener(_onHistoryChanged);
    _loadAllHomeData();
  }

  void _onCountryChanged() {
    _loadAllHomeData(refresh: true);
  }

  void _onHistoryChanged() {
    if (mounted) {
      setState(() {
        _recentHistory = ListeningHistoryService.instance.getRecentTracks();
        final fav = ListeningHistoryService.instance.getFavoriteArtist();
        if (fav != _favoriteArtist) {
          _favoriteArtist = fav;
          if (fav != null) _loadFavoriteArtistTracks(fav);
        }
      });
    }
  }

  @override
  void dispose() {
    CountryService.instance.countryNotifier.removeListener(_onCountryChanged);
    ListeningHistoryService.instance.historyNotifier.removeListener(_onHistoryChanged);
    super.dispose();
  }

  Future<void> _loadAllHomeData({bool refresh = false}) async {
    if (!mounted) return;
    setState(() => _loading = true);

    try {
      final country = CountryService.instance.currentCountry;

      _recentHistory = ListeningHistoryService.instance.getRecentTracks();
      _favoriteArtist = ListeningHistoryService.instance.getFavoriteArtist();

      final homeFeedFuture = InnerTubeService.instance.getHomeFeed(countryCode: country.code);
      final chartsFuture = InnerTubeService.instance.getCharts(countryCode: country.code);
      final newReleasesFuture = InnerTubeService.instance.getNewReleases(countryCode: country.code);

      final results = await Future.wait([
        homeFeedFuture,
        chartsFuture,
        newReleasesFuture,
      ]);

      if (mounted) {
        setState(() {
          _quickPicks = results[0] as List<Track>;
          final chartData = results[1] as ({List<Track> tracks, List<({String name, String subs, String image})> artists});
          _chartTracks = chartData.tracks;
          _chartArtists = chartData.artists;
          _newReleases = results[2] as List<Track>;
          _loading = false;
        });
      }

      if (_favoriteArtist != null) {
        _loadFavoriteArtistTracks(_favoriteArtist!);
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[HomeScreen] load error: $e');
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadFavoriteArtistTracks(String artistName) async {
    try {
      final tracks = await InnerTubeService.instance.search(artistName);
      if (mounted) {
        setState(() {
          _favoriteArtistTracks = tracks.take(8).toList();
        });
      }
    } catch (_) {}
  }

  int get _seed => (_mood + 1) * 7 + _refresh * 13;

  Widget _sec(String key, Widget child) => SliverToBoxAdapter(
        child: Reveal(key: ValueKey('$_seed-$key'), child: child),
      );

  void _open(Widget screen) => Navigator.push(context, MaterialPageRoute(builder: (_) => screen));

  @override
  Widget build(BuildContext context) {`;

const startIdx = s.indexOf(oldStateStart);
const endIdx = s.indexOf(oldStateEnd);

if (startIdx !== -1 && endIdx !== -1) {
  s = s.substring(0, startIdx) + newState + s.substring(endIdx + oldStateEnd.length);
  console.log('Replaced state methods successfully!');
} else {
  console.error('Could not find markers for state replacement');
}

fs.writeFileSync('D:/.gemini/Zenify/mobile/lib/views/home/home_screen.dart', s);
console.log('Saved partial home_screen.dart');

