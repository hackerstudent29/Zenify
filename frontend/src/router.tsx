import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import RootLayout from './app/layout';

// Eagerly loaded critical paths
import Home from './app/page';

// Lazy loaded pages
const AuthPage = React.lazy(() => import('./app/(auth)/login/page'));
const RegisterPage = React.lazy(() => import('./app/(auth)/register/page'));
const AboutPage = React.lazy(() => import('./app/about/page'));
const SettingsPage = React.lazy(() => import('./app/settings/page'));
const FilterSettingsPage = React.lazy(() => import('./app/settings/filter/page'));
const SearchPage = React.lazy(() => import('./app/search/page'));
const RadioPage = React.lazy(() => import('./app/radio/page'));
const HistoryPage = React.lazy(() => import('./app/history/page'));
const ProfilePage = React.lazy(() => import('./app/profile/page'));
const PricingPage = React.lazy(() => import('./app/pricing/page'));
const LibraryPage = React.lazy(() => import('./app/library/page'));
const PaymentCallbackPage = React.lazy(() => import('./app/payment/callback/page'));
const AlbumPage = React.lazy(() => import('./app/album/[id]/page'));
const ArtistPage = React.lazy(() => import('./app/artist/[id]/page'));
const PlaylistPage = React.lazy(() => import('./app/playlist/[id]/page'));
const TrackPage = React.lazy(() => import('./app/track/[id]/page'));
const ExplorePage = React.lazy(() => import('./app/explore/[...id]/page'));
const AdminPage = React.lazy(() => import('./app/admin/page'));
const AdminTracksPage = React.lazy(() => import('./app/admin/tracks/page'));
const PlaylistImportPage = React.lazy(() => import('./app/admin/playlist-import/page'));
const AdminNotificationsPage = React.lazy(() => import('./app/admin/notifications/page'));
const AdminArtistsPage = React.lazy(() => import('./app/admin/artists/page'));
const NewArtistPage = React.lazy(() => import('./app/admin/artists/new/page'));
const AdminArtistDetailPage = React.lazy(() => import('./app/admin/artists/[id]/page'));
const OnboardingPage = React.lazy(() => import('./app/onboarding/page'));
const LyricSyncPage = React.lazy(() => import('./app/admin/lyric-sync/page'));

export default function AppRouter() {
  return (
    <RootLayout>
      <React.Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<AuthPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/filter" element={<FilterSettingsPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/radio" element={<RadioPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/payment/callback" element={<PaymentCallbackPage />} />
          <Route path="/album/:id" element={<AlbumPage />} />
          <Route path="/artist/:id" element={<ArtistPage />} />
          <Route path="/playlist/:id" element={<PlaylistPage />} />
          <Route path="/track/:id" element={<TrackPage />} />
          <Route path="/explore/*" element={<ExplorePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/admin/tracks" element={<AdminTracksPage />} />
          <Route path="/admin/playlist-import" element={<PlaylistImportPage />} />
          <Route path="/admin/notifications" element={<AdminNotificationsPage />} />
          <Route path="/admin/artists" element={<AdminArtistsPage />} />
          <Route path="/admin/artists/new" element={<NewArtistPage />} />
          <Route path="/admin/artists/:id" element={<AdminArtistDetailPage />} />
          <Route path="/admin/lyric-sync" element={<LyricSyncPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </React.Suspense>
    </RootLayout>
  );
}
