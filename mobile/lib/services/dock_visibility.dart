import 'package:flutter/widgets.dart';

/// Global controller for hiding the bottom navigation dock and mini song dock
/// on focused account, authentication, and full-screen detail pages (Login, Signup, Profile, Settings).
///
/// Uses identity tokens instead of a raw reference counter so overlapping
/// sheets, nested tab navigators, or duplicate disposes can never leak the
/// hidden state and strand the bottom dock or miniplayer offscreen.
class DockVisibility {
  DockVisibility._();

  static final ValueNotifier<bool> hideNavDockNotifier =
      ValueNotifier<bool>(false);
  static final ValueNotifier<bool> hideMiniPlayerNotifier =
      ValueNotifier<bool>(false);
  static final ValueNotifier<bool> hideDocksNotifier =
      ValueNotifier<bool>(false);

  static final Set<Object> _navTokens = <Object>{};
  static final Set<Object> _miniTokens = <Object>{};
  static final List<Object> _legacyStack = <Object>[];

  static bool get areDocksHidden => hideNavDockNotifier.value;
  static bool get isNavDockHidden => hideNavDockNotifier.value;
  static bool get isMiniPlayerHidden => hideMiniPlayerNotifier.value;

  static void _syncNotifiers() {
    final hideNav = _navTokens.isNotEmpty;
    final hideMini = _miniTokens.isNotEmpty;
    final hideAny = hideNav || hideMini;
    if (hideNavDockNotifier.value != hideNav) {
      hideNavDockNotifier.value = hideNav;
    }
    if (hideMiniPlayerNotifier.value != hideMini) {
      hideMiniPlayerNotifier.value = hideMini;
    }
    if (hideDocksNotifier.value != hideAny) {
      hideDocksNotifier.value = hideAny;
    }
  }

  /// Acquires a dock-hiding lease for [token] (or a fresh token if omitted).
  static Object acquire({
    bool hideNav = true,
    bool hideMini = false,
    Object? token,
  }) {
    final key = token ?? Object();
    if (hideNav) {
      _navTokens.add(key);
    } else {
      _navTokens.remove(key);
    }
    if (hideMini) {
      _miniTokens.add(key);
    } else {
      _miniTokens.remove(key);
    }
    _syncNotifiers();
    return key;
  }

  /// Releases the dock-hiding lease associated with [token].
  static void release(Object token) {
    final removedNav = _navTokens.remove(token);
    final removedMini = _miniTokens.remove(token);
    if (removedNav || removedMini) {
      _syncNotifiers();
    }
  }

  /// Acquires a dock/miniplayer hide lease for the lifetime of [openModal].
  static Future<T> runModal<T>(
    Future<T> Function() openModal, {
    bool hideNav = true,
    bool hideMini = true,
  }) {
    final token = acquire(hideNav: hideNav, hideMini: hideMini);
    return openModal().whenComplete(() => release(token));
  }

  static void push({bool hideNav = true, bool hideMini = false, Object? token}) {
    final key = token ?? Object();
    if (token == null) {
      _legacyStack.add(key);
    }
    acquire(hideNav: hideNav, hideMini: hideMini, token: key);
  }

  static void pop([Object? token]) {
    if (token != null) {
      release(token);
      return;
    }
    if (_legacyStack.isNotEmpty) {
      release(_legacyStack.removeLast());
    }
  }

  static void reset() {
    _navTokens.clear();
    _miniTokens.clear();
    _legacyStack.clear();
    _syncNotifiers();
  }
}

/// Propagates whether the enclosing tab in `ShellScreen` is currently active.
class DockActiveTabScope extends InheritedWidget {
  const DockActiveTabScope({
    super.key,
    required this.isActive,
    required super.child,
  });

  final bool isActive;

  static bool isActiveOf(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<DockActiveTabScope>();
    return scope?.isActive ?? true;
  }

  @override
  bool updateShouldNotify(DockActiveTabScope oldWidget) =>
      isActive != oldWidget.isActive;
}

/// Convenience mixin for State classes of screens where the navigation dock
/// (and optionally the miniplayer on full-screen auth flows) must hide.
mixin HideDocksMixin<T extends StatefulWidget> on State<T> {
  final Object _dockToken = Object();

  /// Override to `true` on pre-auth screens so the miniplayer also hides.
  bool get hideMiniPlayerWhileActive => false;

  void _syncDockVisibility() {
    if (!mounted) {
      DockVisibility.release(_dockToken);
      return;
    }
    final activeTab = DockActiveTabScope.isActiveOf(context);
    if (!activeTab) {
      DockVisibility.release(_dockToken);
      return;
    }
    DockVisibility.acquire(
      hideNav: true,
      hideMini: hideMiniPlayerWhileActive,
      token: _dockToken,
    );
  }

  @override
  void initState() {
    super.initState();
    DockVisibility.acquire(
      hideNav: true,
      hideMini: hideMiniPlayerWhileActive,
      token: _dockToken,
    );
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _syncDockVisibility();
  }

  @override
  void activate() {
    super.activate();
    _syncDockVisibility();
  }

  @override
  void deactivate() {
    DockVisibility.release(_dockToken);
    super.deactivate();
  }

  @override
  void dispose() {
    DockVisibility.release(_dockToken);
    super.dispose();
  }
}
