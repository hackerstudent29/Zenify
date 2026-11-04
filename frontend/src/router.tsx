import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';

import RootLayout from './app/layout';

// Eagerly loaded critical paths
import Home from './app/page';

// Robust chunk load failure wrapper to handle asset/chunk errors and reload automatically
function lazyWithRetry(importFunc: () => Promise<{ default: React.ComponentType<any> }>) {
  return React.lazy(async () => {
    try {
      return await importFunc();
    } catch (error) {
      console.error("Failed to load chunk, reloading page...", error);
      // Reload the page to load the fresh assets
      window.location.reload();
      return { default: () => null };
    }
  });
}

// Center Loader Fallback for Suspense transitions
const RouteLoader = () => (
  <div className="flex flex-col items-center justify-center min-h-[50vh] w-full gap-4 text-center select-none pointer-events-none">
    <div className="w-10 h-10 rounded-full border-2 border-rose-500/20 border-t-rose-500 animate-spin" />
    <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-[0.2em] animate-pulse">Loading Zenify Frequency...</p>
  </div>
);

// Redirect /search -> /discover preserving any query string
function SearchRedirect() {
  const location = useLocation();
  return <Navigate to={`/discover${location.search}`} replace />;
}

// Lazy loaded pages using lazyWithRetry
const AuthPage = lazyWithRetry(() => import('./app/(auth)/login/page'));
const RegisterPage = lazyWithRetry(() => import('./app/(auth)/register/page'));
const AboutPage = lazyWithRetry(() => import('./app/about/page'));
const AboutZenifyPage = lazyWithRetry(() => import('./app/about-zenify/page'));
const FaqPage = lazyWithRetry(() => import('./app/faq/page'));
const SettingsPage = lazyWithRetry(() => import('./app/settings/page'));
const FilterSettingsPage = lazyWithRetry(() => import('./app/settings/filter/page'));
const DiscoverPage = lazyWithRetry(() => import('./app/discover/page'));
const SearchPage = lazyWithRetry(() => import('./app/search/page'));
const RadioPage = lazyWithRetry(() => import('./app/radio/page'));
const HistoryPage = lazyWithRetry(() => import('./app/history/page'));
const ProfilePage = lazyWithRetry(() => import('./app/profile/page'));
const NotificationsPage = lazyWithRetry(() => import('./app/notifications/page'));
const LikedPage = lazyWithRetry(() => import('./app/liked/page'));
const PaymentCallbackPage = lazyWithRetry(() => import('./app/payment/callback/page'));
const AlbumPage = lazyWithRetry(() => import('./app/album/[id]/page'));
const ArtistPage = lazyWithRetry(() => import('./app/artist/[id]/page'));
const PlaylistPage = lazyWithRetry(() => import('./app/playlist/[id]/page'));
const TrackPage = lazyWithRetry(() => import('./app/track/[id]/page'));
const ExplorePage = lazyWithRetry(() => import('./app/explore/[...id]/page'));
const AdminPage = lazyWithRetry(() => import('./app/admin/page'));
const OnboardingPage = lazyWithRetry(() => import('./app/onboarding/page'));
const LocalLibraryPage = lazyWithRetry(() => import('./app/local-library/page'));
const FollowingPage = lazyWithRetry(() => import('./app/following/page'));
const DayMixPage = lazyWithRetry(() => import('./app/day-mix/page'));
const ReplayPage = lazyWithRetry(() => import('./app/replay/page'));
const BlendHubPage = lazyWithRetry(() => import('./app/blend/page'));
const BlendDetailPage = lazyWithRetry(() => import('./app/blend/[id]/page'));
const BlendJoinPage = lazyWithRetry(() => import('./app/blend/join/[token]/page'));
const TogetherPage = lazyWithRetry(() => import('./app/together/page'));
const TogetherRoomPage = lazyWithRetry(() => import('./app/together/[code]/page'));
const JoinRedirectPage = lazyWithRetry(() => import('./app/j/[code]/page'));
const SectionPage = lazyWithRetry(() => import('./app/section/[type]/page'));
const PrivacyPage = lazyWithRetry(() => import('./app/privacy/page'));
const TermsPage = lazyWithRetry(() => import('./app/terms/page'));
const NotFoundPage = lazyWithRetry(() => import('./app/not-found/page'));

export default function AppRouter() {
  return (
    <RootLayout>
      <React.Suspense fallback={<RouteLoader />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/section/:type" element={<SectionPage />} />
          <Route path="/login" element={<AuthPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Public Information Pages: Creator, Zenify Architecture, Privacy, Terms, Structure */}
          <Route path="/about" element={<AboutPage />} />
          <Route path="/creator" element={<AboutPage />} />
          <Route path="/about/creator" element={<AboutPage />} />
          <Route path="/about-creator" element={<AboutPage />} />
          <Route path="/about-zenify" element={<AboutZenifyPage />} />
          <Route path="/about/zenify" element={<AboutZenifyPage />} />
          <Route path="/faq" element={<FaqPage />} />
          <Route path="/features" element={<FaqPage />} />
          <Route path="/features-and-faq" element={<FaqPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/local-library" element={<LocalLibraryPage />} />
          <Route path="/following" element={<FollowingPage />} />
          <Route path="/day-mix" element={<DayMixPage />} />
          <Route path="/replay" element={<ReplayPage />} />
          <Route path="/blend" element={<BlendHubPage />} />
          <Route path="/blend/:id" element={<BlendDetailPage />} />
          <Route path="/blend/join/:token" element={<BlendJoinPage />} />
          <Route path="/together" element={<TogetherPage />} />
          <Route path="/together/:code" element={<TogetherRoomPage />} />
          <Route path="/j/:code" element={<JoinRedirectPage />} />

          {/* Protected Application Routes */}
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/filter" element={<FilterSettingsPage />} />
          <Route path="/discover" element={<DiscoverPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/radio" element={<RadioPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/profile" element={<ProfilePage />} />
                    <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/library" element={<Navigate to="/liked" replace />} />
          <Route path="/liked" element={<LikedPage />} />
          <Route path="/liked-songs" element={<Navigate to="/liked" replace />} />
          <Route path="/payment/callback" element={<PaymentCallbackPage />} />
          <Route path="/album/:id" element={<AlbumPage />} />
          <Route path="/artist/:id" element={<ArtistPage />} />
          <Route path="/playlist/:id" element={<PlaylistPage />} />
          <Route path="/track/:id" element={<TrackPage />} />
          <Route path="/explore/*" element={<ExplorePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/admin/database" element={<AdminPage />} />
          <Route path="/database-console" element={<Navigate to="/admin" replace />} />
          <Route path="/onboarding" element={<OnboardingPage />} />

          {/* Fallback */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </React.Suspense>
    </RootLayout>
  );
}
