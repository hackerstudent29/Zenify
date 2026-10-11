import dotenv from 'dotenv';
dotenv.config();

import { MailService } from '../services/mail.service.js';
import { CronService } from '../services/cron.service.js';

const to = process.argv[2] || 'test@example.com';
const username = 'Listener';

async function main() {
    console.log(`Sending all mock emails to: ${to}`);

    try {
        console.log('Sending OTP...');
        await MailService.sendOTP(to, '123456');

        console.log('Sending Welcome...');
        await MailService.sendWelcome(to, username);

        console.log('Sending Purchase Confirmation...');
        await MailService.sendPurchaseConfirmation(to, 'Zenify Premium Annual', 999.00, username, new Date(), new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));

        console.log('Sending Subscription Expiry Reminder...');
        await MailService.sendSubscriptionExpiryReminder(to, username, new Date(Date.now() + 24 * 60 * 60 * 1000));

        console.log('Sending Account Deleted...');
        await MailService.sendAccountDeleted(to);

        console.log('Sending Weekly Summary...');
        const sentReal = await CronService.sendWeeklySummaryForUser(to).catch(() => false);
        if (!sentReal) {
            console.log('User not in DB, sending fallback summary...');
            await MailService.sendWeeklySummary(to, username, {
                totalDuration: 420,
                totalStreams: 18,
                uniqueTracksHeard: 12,
                newSongsDiscovered: 4,
                favoritesCount: 3,
                releasedSongsCount: 0,
                insight: 'You explored new playlists and acoustic melodies this week, with active listening during evening hours.',
                longestSessionStr: '1 hr 45 mins on Saturday',
                topTrack: { title: 'Oxygen' },
                topArtist: { name: 'Hiphop Tamizha' },
                top5Tracks: [
                    { title: 'Oxygen', artistName: 'Hiphop Tamizha', playCount: 5, durationMins: 30 },
                    { title: 'Oru Vidha Aasai (The Temptation of Maari)', artistName: 'Anirudh Ravichander', playCount: 4, durationMins: 5 }
                ],
                top3Artists: [
                    { name: 'Hiphop Tamizha', playCount: 5, durationMins: 30 },
                    { name: 'Anirudh Ravichander', playCount: 4, durationMins: 5 }
                ],
                topAlbums: [],
                newFavourites: [],
                releasedSongs: [],
                scheduledSongs: [],
                newReleasesFromFollowed: [],
                subscription: null
            });
        }

        console.log('Sending New Release Alert...');
        await MailService.sendNewReleaseAlert(to, username, {
            title: 'Midnight Echoes',
            artist: 'The Vibe Architects',
            type: 'Single',
            genre: 'Synthwave',
            price: 15.00,
            allowDownloads: true,
            createdAt: new Date()
        });

        console.log('Sending Scheduled Release Reminder...');
        await MailService.sendScheduledReleaseReminder(to, username, {
            title: 'Sunrise Sonata',
            type: 'Album',
            scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        }, {
            coverArt: true,
            audioProcessed: true,
            metadataComplete: false,
            missing: ['Genre/Language metadata']
        });

        console.log('✅ All mock emails sent successfully!');
    } catch (error: any) {
        console.error('❌ Failed to send emails:', error?.response?.data || error?.message || error);
        process.exit(1);
    }
}

main();
