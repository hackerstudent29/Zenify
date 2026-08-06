import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

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

// Lazy loaded pages using lazyWithRetry
const AuthPage = lazyWithRetry(() => import('./app/(auth)/login/page'));
const RegisterPage = lazyWithRetry(() => import('./app/(auth)/register/page'));
const AboutPage = lazyWithRetry(() => import('./app/about/page'));
const AboutZenifyPage = lazyWithRetry(() => import('./app/about-zenify/page'));
const SettingsPage = lazyWithRetry(() => import('./app/settings/page'));
const FilterSettingsPage = lazyWithRetry(() => import('./app/settings/filter/page'));
const SearchPage = lazyWithRetry(() => import('./app/search/page'));
const RadioPage = lazyWithRetry(() => import('./app/radio/page'));
const HistoryPage = lazyWithRetry(() => import('./app/history/page'));
const ProfilePage = lazyWithRetry(() => import('./app/profile/page'));
const PricingPage = lazyWithRetry(() => import('./app/pricing/page'));
const NotificationsPage = lazyWithRetry(() => import('./app/notifications/page'));
const LibraryPage = lazyWithRetry(() => import('./app/library/page'));
const PaymentCallbackPage = lazyWithRetry(() => import('./app/payment/callback/page'));
const AlbumPage = lazyWithRetry(() => import('./app/album/[id]/page'));
const ArtistPage = lazyWithRetry(() => import('./app/artist/[id]/page'));
const PlaylistPage = lazyWithRetry(() => import('./app/playlist/[id]/page'));
const TrackPage = lazyWithRetry(() => import('./app/track/[id]/page'));
const ExplorePage = lazyWithRetry(() => import('./app/explore/[...id]/page'));
const AdminPage = lazyWithRetry(() => import('./app/admin/page'));
const AdminTracksPage = lazyWithRetry(() => import('./app/admin/tracks/page'));
const PlaylistImportPage = lazyWithRetry(() => import('./app/admin/playlist-import/page'));
const AdminNotificationsPage = lazyWithRetry(() => import('./app/admin/notifications/page'));
const AdminArtistsPage = lazyWithRetry(() => import('./app/admin/artists/page'));
const NewArtistPage = lazyWithRetry(() => import('./app/admin/artists/new/page'));
const AdminArtistDetailPage = lazyWithRetry(() => import('./app/admin/artists/[id]/page'));
const OnboardingPage = lazyWithRetry(() => import('./app/onboarding/page'));
const LyricSyncPage = lazyWithRetry(() => import('./app/admin/lyric-sync/page'));
const AdminSettingsPage = lazyWithRetry(() => import('./app/admin/settings/page'));

export default function AppRouter() {
 return (
 <RootLayout>
 <React.Suspense fallback={<RouteLoader />}>
 <Routes>
 <Route path="/" element={<Home />} />
 <Route path="/login" element={<AuthPage />} />
 <Route path="/register" element={<RegisterPage />} />
 <Route path="/about" element={<AboutPage />} />
 <Route path="/about-zenify" element={<AboutZenifyPage />} />
 <Route path="/settings" element={<SettingsPage />} />
 <Route path="/settings/filter" element={<FilterSettingsPage />} />
 <Route path="/search" element={<SearchPage />} />
 <Route path="/radio" element={<RadioPage />} />
 <Route path="/history" element={<HistoryPage />} />
 <Route path="/profile" element={<ProfilePage />} />
 <Route path="/pricing" element={<PricingPage />} />
 <Route path="/notifications" element={<NotificationsPage />} />
 <Route path="/library" element={<LibraryPage />} />
 <Route path="/payment/callback" element={<PaymentCallbackPage />} />
 <Route path="/album/:id" element={<AlbumPage />} />
 <Route path="/artist/:id" element={<ArtistPage />} />
 <Route path="/playlist/:id" element={<PlaylistPage />} />
 <Route path="/track/:id" element={<TrackPage />} />
 <Route path="/explore/*" element={<ExplorePage />} />
 <Route path="/admin" element={<AdminPage />} />
 <Route path="/admin/settings" element={<AdminSettingsPage />} />
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
