import { prisma } from '../utils/prisma';

export interface UserSettingsPayload {
  // Audio
  audioQuality?: string;
  cellularQuality?: string;
  downloadQuality?: string;
  normalizeVolume?: boolean;
  explicitFilter?: boolean;
  gaplessPlayback?: boolean;

  // Playback
  crossfade?: boolean;
  autoplay?: boolean;
  autoHideDetails?: boolean;
  lyricsDefaultScript?: string;

  // Aesthetics
  accentColor?: string;
  theme?: string;

  // Notifications
  emailNotifications?: boolean;
  weeklySummaryEmail?: boolean;
  newReleaseAlerts?: boolean;
  playlistUpdates?: boolean;

  // Privacy & Personalization
  personalizationEnabled?: boolean;
  listeningActivity?: boolean;
  saveListeningHistory?: boolean;
  profileVisibility?: string;
  showTopArtists?: boolean;

  // Social
  defaultRoomMode?: string;
  whoCanInvite?: string;

  // Content / Region
  selectedCountryCode?: string;
  selectedCountryName?: string;
  languages?: string[];

  // Profile fields on User model
  displayName?: string;
  bio?: string;
  country?: string;
  age?: number;
}

export class UserSettingsService {
  /**
   * Retrieve full user settings and sync timestamps
   */
  static async getSettings(userId: string) {
    const [user, preferences] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          displayName: true,
          username: true,
          avatarUrl: true,
          bio: true,
          country: true,
          age: true,
          isGuest: true,
          createdAt: true,
          identities: {
            select: {
              provider: true,
              email: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.userPreferences.findUnique({
        where: { userId },
      }),
    ]);

    const syncTimestamps = (preferences?.syncTimestamps as Record<string, string>) || {};

    return {
      user: {
        id: user?.id,
        email: user?.email,
        name: user?.name,
        displayName: user?.displayName || user?.name || '',
        username: user?.username || '',
        avatarUrl: user?.avatarUrl,
        bio: user?.bio || '',
        country: user?.country || preferences?.selectedCountryCode || null,
        age: user?.age || null,
        isGuest: user?.isGuest ?? false,
        identities: user?.identities || [],
      },
      settings: {
        // Audio
        audioQuality: preferences?.audioQuality ?? 'high',
        cellularQuality: preferences?.cellularQuality ?? 'high',
        downloadQuality: preferences?.downloadQuality ?? 'lossless',
        normalizeVolume: preferences?.normalizeVolume ?? true,
        explicitFilter: preferences?.explicitFilter ?? false,
        gaplessPlayback: preferences?.gaplessPlayback ?? true,

        // Playback
        crossfade: preferences?.crossfade ?? false,
        autoplay: preferences?.autoplay ?? true,
        autoHideDetails: preferences?.autoHideDetails ?? true,
        lyricsDefaultScript: preferences?.lyricsDefaultScript ?? 'original',

        // Aesthetics
        accentColor: preferences?.accentColor ?? 'red',
        theme: preferences?.theme ?? 'dark',

        // Notifications
        emailNotifications: preferences?.emailNotifications ?? false,
        weeklySummaryEmail: preferences?.weeklySummaryEmail ?? false,
        newReleaseAlerts: preferences?.newReleaseAlerts ?? false,
        playlistUpdates: preferences?.playlistUpdates ?? false,

        // Privacy
        personalizationEnabled: preferences?.personalizationEnabled ?? true,
        listeningActivity: preferences?.listeningActivity ?? true,
        saveListeningHistory: preferences?.saveListeningHistory ?? true,
        profileVisibility: preferences?.profileVisibility ?? 'public',
        showTopArtists: preferences?.showTopArtists ?? true,

        // Social
        defaultRoomMode: preferences?.defaultRoomMode ?? 'dj',
        whoCanInvite: preferences?.whoCanInvite ?? 'everyone',

        // Region / Languages
        selectedCountryCode: preferences?.selectedCountryCode ?? user?.country ?? 'IN',
        selectedCountryName: preferences?.selectedCountryName ?? 'India',
        languages: preferences?.languages ?? ['ta', 'en', 'hi'],
      },
      syncTimestamps,
    };
  }

  /**
   * Optimistic update with per-key timestamp conflict resolution
   */
  static async updateSettings(
    userId: string,
    updates: UserSettingsPayload,
    clientTimestamps: Record<string, string> = {}
  ) {
    // 1. Fetch current preferences and timestamps
    const currentPrefs = await prisma.userPreferences.findUnique({
      where: { userId },
    });

    const existingTimestamps = (currentPrefs?.syncTimestamps as Record<string, string>) || {};
    const updatedTimestamps = { ...existingTimestamps };
    const nowIso = new Date().toISOString();

    const allowedPrefFields = [
      'audioQuality',
      'cellularQuality',
      'downloadQuality',
      'normalizeVolume',
      'explicitFilter',
      'gaplessPlayback',
      'crossfade',
      'autoplay',
      'autoHideDetails',
      'lyricsDefaultScript',
      'accentColor',
      'theme',
      'emailNotifications',
      'weeklySummaryEmail',
      'newReleaseAlerts',
      'playlistUpdates',
      'personalizationEnabled',
      'listeningActivity',
      'saveListeningHistory',
      'profileVisibility',
      'showTopArtists',
      'defaultRoomMode',
      'whoCanInvite',
      'selectedCountryCode',
      'selectedCountryName',
      'languages',
    ];

    const prefDataToUpdate: Record<string, any> = {};
    const userDataToUpdate: Record<string, any> = {};

    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) continue;

      const incomingTimeStr = clientTimestamps[key] || nowIso;
      const incomingTime = new Date(incomingTimeStr).getTime();
      const existingTime = existingTimestamps[key] ? new Date(existingTimestamps[key]).getTime() : 0;

      // Last-write-wins: incoming time must be newer or equal to existing
      if (incomingTime < existingTime) {
        continue; // Server has a newer update for this field, discard client change
      }

      updatedTimestamps[key] = incomingTimeStr;

      if (allowedPrefFields.includes(key)) {
        prefDataToUpdate[key] = value;
      } else if (['displayName', 'bio', 'country', 'age'].includes(key)) {
        userDataToUpdate[key] = value;
        if (key === 'displayName') {
          userDataToUpdate['name'] = value;
        }
      }
    }

    // 2. Perform atomic updates
    const operations: Promise<any>[] = [];

    if (Object.keys(prefDataToUpdate).length > 0 || Object.keys(updatedTimestamps).length > 0) {
      operations.push(
        prisma.userPreferences.upsert({
          where: { userId },
          create: {
            userId,
            ...prefDataToUpdate,
            syncTimestamps: updatedTimestamps,
          },
          update: {
            ...prefDataToUpdate,
            syncTimestamps: updatedTimestamps,
          },
        })
      );
    }

    if (Object.keys(userDataToUpdate).length > 0) {
      operations.push(
        prisma.user.update({
          where: { id: userId },
          data: userDataToUpdate,
        })
      );
    }

    await Promise.all(operations);

    return this.getSettings(userId);
  }
}

