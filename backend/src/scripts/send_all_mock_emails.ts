import dotenv from 'dotenv';
dotenv.config();

import { MailService } from '../services/mail.service.js';

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
        await MailService.sendWeeklySummary(to, username, {
            totalDuration: 1450, // 24 hours and 10 mins
            totalStreams: 342,
            uniqueTracksHeard: 128,
            newSongsDiscovered: 45,
            favoritesCount: 12,
            releasedSongsCount: 0,
            insight: 'You spent a lot of time exploring new acoustic tracks this week, with a strong focus on weekend listening.',
            longestSessionStr: '3 hrs 45 mins on Saturday',
            topTrack: { title: 'Bohemian Rhapsody' },
            topArtist: { name: 'Queen' },
            top5Tracks: [
                { title: 'Bohemian Rhapsody', artistName: 'Queen', playCount: 42, durationMins: 252 },
                { title: 'Stairway to Heaven', artistName: 'Led Zeppelin', playCount: 38, durationMins: 304 },
                { title: 'Hotel California', artistName: 'Eagles', playCount: 35, durationMins: 220 },
                { title: "Sweet Child O' Mine", artistName: "Guns N' Roses", playCount: 30, durationMins: 178 },
                { title: 'Smells Like Teen Spirit', artistName: 'Nirvana', playCount: 28, durationMins: 140 }
            ],
            top3Artists: [
                { name: 'Queen', playCount: 150, durationMins: 800 },
                { name: 'Led Zeppelin', playCount: 120, durationMins: 950 },
                { name: 'Eagles', playCount: 85, durationMins: 450 }
            ],
            topAlbums: [],
            newFavourites: [],
            releasedSongs: [],
            scheduledSongs: [],
            newReleasesFromFollowed: [],
            subscription: null
        });

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
