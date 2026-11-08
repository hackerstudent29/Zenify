import 'dart:math' as math;
import 'package:flutter/widgets.dart';

/// Global controller for hiding the bottom navigation dock and mini song dock
/// on focused account, authentication, and full-screen detail pages (Login, Signup, Profile, Settings).
class DockVisibility {
  DockVisibility._();

  static final ValueNotifier<bool> hideDocksNotifier = ValueNotifier<bool>(false);
  static int _hiddenCount = 0;

  static bool get areDocksHidden => hideDocksNotifier.value;

  static void push() {
    _hiddenCount++;
    if (!hideDocksNotifier.value) {
      hideDocksNotifier.value = true;
    }
  }

  static void pop() {
    _hiddenCount = math.max(0, _hiddenCount - 1);
    final shouldHide = _hiddenCount > 0;
    if (hideDocksNotifier.value != shouldHide) {
      hideDocksNotifier.value = shouldHide;
    }
  }

  static void reset() {
    _hiddenCount = 0;
    hideDocksNotifier.value = false;
  }
}

/// Convenience mixin for State classes of screens where docks must not show.
mixin HideDocksMixin<T extends StatefulWidget> on State<T> {
  @override
  void initState() {
    super.initState();
    DockVisibility.push();
  }

  @override
  void dispose() {
    DockVisibility.pop();
    super.dispose();
  }
}
