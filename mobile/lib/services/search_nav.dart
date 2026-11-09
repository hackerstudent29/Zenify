import 'package:flutter/foundation.dart';

/// off    → normal dock
/// bar    → dock morphed into [back circle] + [wide search bar]
/// typing → search field lives at the top of the page, dock back to normal
enum SearchPhase { off, bar, typing }

class SearchNav {
  SearchNav._();
  static final ValueNotifier<SearchPhase> phase =
      ValueNotifier<SearchPhase>(SearchPhase.off);
}
