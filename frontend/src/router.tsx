import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import RootLayout from './app/layout';

// Import all pages
import Home from './app/page';
import AuthPage from './app/(auth)/login/page';
import RegisterPage from './app/(auth)/register/page';
import AboutPage from './app/about/page';
import SettingsPage from './app/settings/page';
import FilterSettingsPage from './app/settings/filter/page';
import SearchPage from './app/search/page';
import RadioPage from './app/radio/page';
import HistoryPage from './app/history/page';
import ProfilePage from './app/profile/page';
import PricingPage from './app/pricing/page';
import LibraryPage from './app/library/page';
import PaymentCallbackPage from './app/payment/callback/page';
import AlbumPage from './app/album/[id]/page';
import ArtistPage from './app/artist/[id]/page';
import PlaylistPage from './app/playlist/[id]/page';
import TrackPage from './app/track/[id]/page';
import ExplorePage from './app/explore/[...id]/page';
import AdminPage from './app/admin/page';
import AdminTracksPage from './app/admin/tracks/page';
import PlaylistImportPage from './app/admin/playlist-import/page';
import AdminNotificationsPage from './app/admin/notifications/page';
import AdminArtistsPage from './app/admin/artists/page';
import NewArtistPage from './app/admin/artists/new/page';
import AdminArtistDetailPage from './app/admin/artists/[id]/page';
import OnboardingPage from './app/onboarding/page';
import LyricSyncPage from './app/admin/lyric-sync/page';

export default function AppRouter() {
  return (
    <RootLayout>
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
    </RootLayout>
  );
}
