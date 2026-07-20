import nodemailer from 'nodemailer';
import { config } from '../config/env';
import { askAI, FAST_MODEL as DEFAULT_MODEL } from '../utils/ai.js';

export class MailService {
  private static transporter: any = null;

  private static async getTransporter() {
    if (this.transporter) return this.transporter;

    const dns = require('dns').promises;
    let resolvedHost = config.SMTP_HOST;
    if (config.SMTP_HOST && !/^[0-9.]+$/.test(config.SMTP_HOST)) {
      try {
        const ips = await dns.resolve4(config.SMTP_HOST);
        if (ips && ips.length > 0) {
          resolvedHost = ips[0];
          console.log(`[Mail] Resolved ${config.SMTP_HOST} to ${resolvedHost} for IPv4 SMTP`);
        }
      } catch (dnsErr: any) {
        console.warn(`[Mail] DNS resolution failed for ${config.SMTP_HOST}, falling back: ${dnsErr.message}`);
      }
    }

    this.transporter = nodemailer.createTransport({
      host: resolvedHost,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      auth: {
        user: config.SMTP_USER,
        pass: config.SMTP_PASS,
      },
      tls: {
        servername: config.SMTP_HOST,
      },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000,
    } as any);

    return this.transporter;
  }

  private static async send(payload: { to: string; subject: string; html: string }) {
    if (config.BREVO_API_KEY) {
      console.log(`[Mail] Sending email via Brevo to ${payload.to}`);
      const axios = require('axios');
      try {
        const response = await axios.post(
          'https://api.brevo.com/v3/smtp/email',
          {
            sender: {
              name: 'Zenify',
              email: config.BREVO_FROM_EMAIL || 'onboarding@brevo.com',
            },
            to: [{ email: payload.to }],
            subject: payload.subject,
            htmlContent: payload.html,
          },
          {
            headers: {
              'api-key': config.BREVO_API_KEY,
              'content-type': 'application/json',
              'accept': 'application/json',
            },
          }
        );
        return response.data;
      } catch (err: any) {
        console.error('[Mail] Brevo API error details:', err.response?.data || err.message);
        throw err;
      }
    } else {
      console.log(`[Mail] Sending email via Nodemailer SMTP to ${payload.to}`);
      try {
        const activeTransporter = await this.getTransporter();
        return await activeTransporter.sendMail({
          from: `"Zenify" <${config.SMTP_USER}>`,
          to: payload.to,
          subject: payload.subject,
          html: payload.html,
        });
      } catch (err) {
        this.transporter = null;
        throw err;
      }
    }
  }

  private static getEmailTemplate(title: string, bodyContent: string) {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Nunito:wght@700&display=swap" rel="stylesheet">
<style>
  body {
    margin: 0;
    padding: 0;
    background-color: #0a0a0f;
    font-family: 'Inter', -apple-system, sans-serif;
  }
  @media only screen and (max-width: 600px) {
    .container {
      width: 100% !important;
      padding: 20px 10px !important;
    }
    .stats-grid {
      display: block !important;
    }
    .stats-card {
      width: 100% !important;
      margin-bottom: 12px !important;
      display: block !important;
    }
  }
</style>
</head>
<body style="background-color: #0a0a0f; color: #e2e8f0; font-family: 'Inter', -apple-system, sans-serif; margin: 0; padding: 0;">
  <div style="background-color: #0a0a0f; padding: 40px 0; width: 100%;">
    <table class="container" width="600" cellpadding="0" cellspacing="0" align="center" style="max-width: 600px; margin: 0 auto; background-color: #0a0a0f;">
      <!-- Header with Logo -->
      <tr>
        <td align="center" style="padding: 20px 0 40px 0;">
          <img src="${config.FRONTEND_URL}/zenify-logo-email.png" alt="Zenify Logo" width="220" style="display: block; border: 0; max-width: 220px;" />
        </td>
      </tr>
      <!-- Body Content -->
      <tr>
        <td style="padding: 0;">
          ${bodyContent}
        </td>
      </tr>
      <!-- Footer -->
      <tr>
        <td style="padding: 40px 20px; text-align: center; border-top: 1px solid rgba(255,255,255,0.08);">
          <p style="color: #94a3b8; font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 8px 0;">&mdash; zenify Music Group &mdash;</p>
          <p style="color: #64748b; font-size: 11px; margin: 0 0 20px 0;">Music. Engineered for Depth.</p>
          <p style="color: #475569; font-size: 10px; margin: 0 0 12px 0;">Designed by Zendrum Team &bull; ${new Date().getFullYear()}</p>
          <p style="color: #334155; font-size: 9px; line-height: 1.5; margin: 0;">
            You are receiving this because you are a registered user of Zenify. To manage your notification preferences or unsubscribe, please visit your account settings.
          </p>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;
  }

  static async sendOTP(to: string, otp: string) {
    const html = this.getEmailTemplate('Verification Code', `
      <div style="background-color: #111118; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 40px; text-align: center; margin-bottom: 30px;">
        <h1 style="color: #ffffff; font-size: 24px; font-weight: 600; margin: 0 0 16px 0;">Verify your identity</h1>
        <p style="color: #e2e8f0; font-size: 15px; line-height: 1.6; margin: 0 0 32px 0; font-weight: 300;">Please use the following verification code to secure your Zenify account.</p>
        
        <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto 32px auto;">
          <tr>
            <td style="background-color: #0a0a0f; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 20px 40px; color: #f43f5e; font-family: 'SF Mono', monospace; font-size: 36px; font-weight: 700; letter-spacing: 6px;">
              ${otp}
            </td>
          </tr>
        </table>
        <p style="color: #94a3b8; font-size: 12px; margin: 0;">This code is valid for 10 minutes. If you did not request this, please ignore this email.</p>
      </div>
    `);
    return await this.send({ to, subject: 'Your Verification Code', html });
  }

  static async sendWelcome(to: string, name?: string) {
    const username = name || 'there';
    let aiContent = { 
      subject: 'Your sound starts here — Welcome to Zenify', 
      intro: `Hi ${username}, welcome to Zenify.`, 
      body: `Your space is waiting. Experience millions of songs, ad-free, with high-fidelity studio precision. Every detail. Every layer.`, 
      outro: `Let the music take over.` 
    };
    try {
      const prompt = `You are the AI copywriter for Zenify, a high-fidelity premium streaming service. Write a welcoming intro email for "${username}".
Write in Zenify's voice: modern, music-focused, warm but not corporate.
Return ONLY a raw JSON object with the schema:
{
  "subject": "A creative welcoming subject line",
  "intro": "1-2 sentences welcoming them",
  "body": "2-3 sentences about what makes Zenify special (high fidelity, studio quality, pure sound)",
  "outro": "1-2 sentences wishing them an amazing listening journey"
}
Do not include markdown or backticks. Just raw JSON.`;
      const res = await askAI(prompt, DEFAULT_MODEL);
      const cleanJson = res.replace(/```json/g, '').replace(/```/g, '').trim();
      aiContent = JSON.parse(cleanJson);
    } catch (err) {
      console.error('[Mail] Welcome AI content failure:', err);
    }

    const html = this.getEmailTemplate(aiContent.subject, `
      <div style="background-color: #111118; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 40px; text-align: center; margin-bottom: 30px;">
        <h1 style="color: #ffffff; font-size: 28px; font-weight: 700; margin: 0 0 24px 0; letter-spacing: -0.02em;">Welcome to <span style="color: #f43f5e;">Zenify</span></h1>
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.7; margin: 0 0 20px 0; font-weight: 300;">${aiContent.intro}</p>
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0; font-weight: 300;">${aiContent.body}</p>
        <p style="color: #e2e8f0; font-size: 16px; line-height: 1.7; margin: 0 0 40px 0; font-weight: 300;">${aiContent.outro}</p>
        
        <a href="${config.FRONTEND_URL}" style="background-color: #f43f5e; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; display: inline-block;">▶ Start Listening</a>
      </div>
    `);

    return await this.send({ to, subject: aiContent.subject, html });
  }

  static async sendPurchaseConfirmation(to: string, itemName: string, amount: number, username: string, purchaseDate: Date, expiryDate?: Date) {
    const dateStr = purchaseDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr = purchaseDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const expiryStr = expiryDate ? expiryDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/A';

    let aiContent = { 
      subject: 'Your Zenify Premium is active!', 
      thankYou: 'Thank you for your purchase. Your premium membership is activated and you now have full access to Zenify.' 
    };
    try {
      const prompt = `You are the AI copywriter for Zenify. Write a purchase confirmation thank you note for "${username}" who bought "${itemName}" for ₹${amount.toFixed(2)}.
Return ONLY a raw JSON object with the schema:
{
  "subject": "A creative subject line celebrating their premium upgrade",
  "thankYou": "A 2-3 sentence enthusiastic paragraph confirming their payment and welcoming them to premium sound features"
}
Do not include markdown or backticks. Just raw JSON.`;
      const res = await askAI(prompt, DEFAULT_MODEL);
      const cleanJson = res.replace(/```json/g, '').replace(/```/g, '').trim();
      aiContent = JSON.parse(cleanJson);
    } catch (err) {
      console.error('[Mail] Purchase confirmation AI content failure:', err);
    }

    const html = this.getEmailTemplate(aiContent.subject, `
      <div style="background-color: #111118; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 40px; margin-bottom: 30px;">
        <h1 style="color: #ffffff; font-size: 24px; font-weight: 600; margin: 0 0 16px 0; text-align: center;">Welcome to Premium Sound</h1>
        <p style="color: #e2e8f0; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">Hi <span style="color: #ffffff; font-weight: 600;">${username}</span>,</p>
        <p style="color: #e2e8f0; font-size: 15px; line-height: 1.6; margin: 0 0 30px 0;">${aiContent.thankYou}</p>
        
        <p style="color: #f43f5e; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 16px 0; font-weight: 600;">Order Summary</p>
        <div style="background-color: #0a0a0f; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 24px; margin-bottom: 30px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="color: #94a3b8; font-size: 13px; padding-bottom: 8px;">Date:</td><td align="right" style="color: #f43f5e; font-size: 13px; font-weight: 600; padding-bottom: 8px;">${dateStr} ${timeStr}</td></tr>
            <tr><td style="color: #94a3b8; font-size: 13px; padding-bottom: 8px;">Plan Selected:</td><td align="right" style="color: #ffffff; font-size: 13px; font-weight: 600; padding-bottom: 8px;">${itemName}</td></tr>
            <tr><td style="color: #94a3b8; font-size: 13px; padding-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.08);">Plan Expiry:</td><td align="right" style="color: #ffffff; font-size: 13px; font-weight: 600; padding-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.08);">${expiryStr}</td></tr>
            <tr><td style="color: #e2e8f0; font-size: 14px; font-weight: 600; padding-top: 16px;">Total Paid:</td><td align="right" style="color: #f43f5e; font-size: 18px; font-weight: 700; padding-top: 16px;">₹${amount.toFixed(2)}</td></tr>
          </table>
        </div>

        <div style="text-align: center;">
          <a href="${config.FRONTEND_URL}" style="background-color: #f43f5e; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">Explore Premium Features</a>
        </div>
      </div>
    `);

    return await this.send({ to, subject: aiContent.subject, html });
  }

  static async sendSubscriptionExpiryReminder(to: string, username: string, expiryDate: Date) {
    const expiryStr = expiryDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

    let aiContent = { 
      subject: 'Action Required: Your Zenify Premium is expiring tomorrow', 
      intro: `Your subscription expires tomorrow on ${expiryStr}.`, 
      renewHype: `Keep the music flowing with high-fidelity sound, ad-free streaming, and your entire library.` 
    };
    try {
      const prompt = `You are the AI copywriter for Zenify. Write a subscription expiry reminder for "${username}" whose subscription expires tomorrow (${expiryStr}).
Return ONLY a raw JSON object with the schema:
{
  "subject": "A creative urgent subject line warning them",
  "intro": "1-2 sentences warning them that their premium plan expires tomorrow",
  "renewHype": "2-3 sentences hyping them about keeping premium (no ads, offline downloads, studio audio) to renew"
}
Do not include markdown or backticks. Just raw JSON.`;
      const res = await askAI(prompt, DEFAULT_MODEL);
      const cleanJson = res.replace(/```json/g, '').replace(/```/g, '').trim();
      aiContent = JSON.parse(cleanJson);
    } catch (err) {
      console.error('[Mail] Subscription expiry reminder AI content failure:', err);
    }

    const html = this.getEmailTemplate(aiContent.subject, `
      <div style="background-color: #111118; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 40px; margin-bottom: 30px;">
        <h1 style="color: #ffffff; font-size: 24px; font-weight: 600; margin: 0 0 16px 0; text-align: center;">Don't miss a beat.</h1>
        <p style="color: #e2e8f0; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">Hello <span style="color: #ffffff; font-weight: 600;">${username}</span>,</p>
        <p style="color: #e2e8f0; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">${aiContent.intro}</p>
        
        <div style="background-color: #0a0a0f; border: 1px solid #f43f5e; border-radius: 12px; padding: 24px; margin-bottom: 30px; text-align: center;">
          <p style="color: #ffffff; font-size: 16px; font-weight: 600; margin: 0 0 8px 0;">Keep the music flowing.</p>
          <p style="color: #94a3b8; font-size: 14px; line-height: 1.5; margin: 0 0 20px 0;">${aiContent.renewHype}</p>
          <a href="${config.FRONTEND_URL}/pricing" style="background-color: #f43f5e; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">Renew Subscription</a>
        </div>
      </div>
    `);

    return await this.send({ to, subject: aiContent.subject, html });
  }

  static async sendAccountDeleted(to: string) {
    let aiContent = { 
      subject: 'We\'ve closed your Zenify account', 
      message: `Your account has been deleted as requested. We've removed all your saved playlists, history, and uploaded tracks from our systems.` 
    };
    try {
      const prompt = `You are the AI copywriter for Zenify. Write a deletion confirmation email.
Return ONLY a raw JSON object with the schema:
{
  "subject": "A creative subject line acknowledging account closure",
  "message": "3-4 sentences of warm, respectful, music-first farewell. Confirming all data (likes, playlists) is removed."
}
Do not include markdown or backticks. Just raw JSON.`;
      const res = await askAI(prompt, DEFAULT_MODEL);
      const cleanJson = res.replace(/```json/g, '').replace(/```/g, '').trim();
      aiContent = JSON.parse(cleanJson);
    } catch (err) {
      console.error('[Mail] Account deleted AI content failure:', err);
    }

    const html = this.getEmailTemplate(aiContent.subject, `
      <div style="background-color: #111118; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 40px; margin-bottom: 30px;">
        <h1 style="color: #ffffff; font-size: 24px; font-weight: 600; margin: 0 0 24px 0; text-align: center;">The Sound Fades Here.</h1>
        <p style="color: #e2e8f0; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0; font-weight: 300;">${aiContent.message}</p>
        <div style="height: 1px; width: 100%; background-color: rgba(255,255,255,0.08); margin: 0 auto 24px auto;"></div>
        <p style="color: #94a3b8; font-size: 13px; text-align: center; margin: 0;">If you ever choose to return, you're always welcome to start fresh.</p>
      </div>
    `);

    return await this.send({ to, subject: aiContent.subject, html });
  }

  static async sendWeeklySummary(to: string, username: string, stats: { 
    totalDuration: number; 
    topTrack: any; 
    topArtist: any; 
    totalStreams: number; 
    insight: string;
    favoritesCount: number;
    releasedSongsCount: number;
    uniqueTracksHeard?: number;
    newSongsDiscovered?: number;
    longestSessionStr?: string;
    top5Tracks?: any[];
    top3Artists?: any[];
    topAlbums?: any[];
    newFavourites?: any[];
    releasedSongs?: any[];
    scheduledSongs?: any[];
    newReleasesFromFollowed?: any[];
    subscription?: any;
  }) {
    const statsText = `
    - User Name: ${username}
    - Total Time Listened: ${Math.round(stats.totalDuration / 60)} hours
    - Total Plays/Streams: ${stats.totalStreams}
    - Unique Tracks Heard: ${stats.uniqueTracksHeard || 0}
    - New Discoveries: ${stats.newSongsDiscovered || 0}
    - Favorites Added: ${stats.favoritesCount}
    - Longest Session: ${stats.longestSessionStr || 'N/A'}
    - Top Track of the Week: "${stats.topTrack ? stats.topTrack.title : 'N/A'}" by ${stats.topArtist ? stats.topArtist.name : 'N/A'}
    `;

    let aiContent = {
      subject: `Your week in music — ${Math.round(stats.totalDuration / 60)} hrs, ${stats.favoritesCount} new favorites`,
      intro: `Hi ${username}, here is your customized soundscape review.`,
      insight: stats.insight || `You explored some great music this week, especially tuning in on your favorite days.`,
      persona: `Zenify Explorer`,
      updatesBlurb: `We've centered the full view player lyrics on mobile and streamlined logo transitions.`,
      outro: `See you next week on Zenify!`
    };

    try {
      const prompt = `You are the AI copywriter for Zenify. Write the personalized text paragraphs for ${username}'s Weekly Summary email.
Use this context data:
${statsText}

Platform updates this week to report:
- Centered lyrics layout in the full-view player on mobile devices for improved readability
- Smooth, continuous gradient color transitions on the Zenify logo
- High-fidelity audio cache optimizations to speed up song play

Return ONLY a raw JSON object with the schema:
{
  "subject": "A creative subject line summarizing their week (e.g., 'Your week in music — 14 hrs, 3 new favourites, and a lot of Anirudh')",
  "intro": "1-2 sentences introducing the weekly recap",
  "insight": "2-3 sentences explaining their listening habits/patterns and artist preferences based on the stats",
  "persona": "A fun, creative 2-3 word music persona title representing their listening vibe this week (e.g. 'Midnight Melody Chaser', 'Vibe Architect', 'Vocal Purist', 'Acoustic Explorer')",
  "updatesBlurb": "2-3 sentences summarizing the new platform updates",
  "outro": "1-2 sentences of clean closing encouragement"
}
Do not include markdown or backticks. Just raw JSON.`;
      const res = await askAI(prompt, DEFAULT_MODEL);
      const cleanJson = res.replace(/```json/g, '').replace(/```/g, '').trim();
      aiContent = JSON.parse(cleanJson);
    } catch (err) {
      console.error('[Mail] Weekly Summary AI generation failure:', err);
    }

    const durationHrs = Math.floor(stats.totalDuration / 60);
    const durationMins = stats.totalDuration % 60;
    const durationDisplay = durationHrs > 0 ? `${durationHrs} hrs ${durationMins} mins` : `${durationMins} mins`;

    const statsGrid = `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
        <tr>
          <td width="50%" valign="top" style="padding-right: 6px; padding-bottom: 12px;">
            <div style="background-color: #111118; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 16px; text-align: left;">
              <div style="color: #94a3b8; font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;">Listening Time</div>
              <div style="color: #f43f5e; font-size: 20px; font-weight: 700; margin-top: 4px;">${durationDisplay}</div>
            </div>
          </td>
          <td width="50%" valign="top" style="padding-left: 6px; padding-bottom: 12px;">
            <div style="background-color: #111118; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 16px; text-align: left;">
              <div style="color: #94a3b8; font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;">Total Plays</div>
              <div style="color: #f43f5e; font-size: 20px; font-weight: 700; margin-top: 4px;">${stats.totalStreams} plays</div>
            </div>
          </td>
        </tr>
        <tr>
          <td width="50%" valign="top" style="padding-right: 6px; padding-bottom: 12px;">
            <div style="background-color: #111118; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 16px; text-align: left;">
              <div style="color: #94a3b8; font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;">Unique Tracks</div>
              <div style="color: #f43f5e; font-size: 20px; font-weight: 700; margin-top: 4px;">${stats.uniqueTracksHeard || 0} songs</div>
            </div>
          </td>
          <td width="50%" valign="top" style="padding-left: 6px; padding-bottom: 12px;">
            <div style="background-color: #111118; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 16px; text-align: left;">
              <div style="color: #94a3b8; font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;">New Discoveries</div>
              <div style="color: #f43f5e; font-size: 20px; font-weight: 700; margin-top: 4px;">${stats.newSongsDiscovered || 0} tracks</div>
            </div>
          </td>
        </tr>
        <tr>
          <td width="50%" valign="top" style="padding-right: 6px;">
            <div style="background-color: #111118; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 16px; text-align: left;">
              <div style="color: #94a3b8; font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;">New Favorites</div>
              <div style="color: #f43f5e; font-size: 20px; font-weight: 700; margin-top: 4px;">+${stats.favoritesCount} likes</div>
            </div>
          </td>
          <td width="50%" valign="top" style="padding-left: 6px;">
            <div style="background-color: #111118; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 16px; text-align: left;">
              <div style="color: #94a3b8; font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;">Longest Session</div>
              <div style="color: #f43f5e; font-size: 14px; font-weight: 700; margin-top: 8px; line-height: 1.3;">${stats.longestSessionStr || 'N/A'}</div>
            </div>
          </td>
        </tr>
      </table>
    `;

    let top5Html = '';
    if (stats.top5Tracks && stats.top5Tracks.length > 0) {
      top5Html = `
        <div style="background-color: #111118; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 24px; margin-bottom: 30px;">
          <h2 style="color: #ffffff; font-size: 16px; font-weight: 600; margin: 0 0 16px 0; text-transform: uppercase; letter-spacing: 1px;">Top 5 Played This Week</h2>
          <table width="100%" cellpadding="0" cellspacing="0">
            ${stats.top5Tracks.map((t, idx) => `
              <tr style="${idx > 0 ? 'border-top: 1px solid rgba(255,255,255,0.06);' : ''}">
                <td style="padding: 10px 0; color: #ffffff; font-weight: 600; font-size: 14px;" width="30">#${idx + 1}</td>
                <td style="padding: 10px 0;" width="50">
                  ${t.coverUrl ? `<img src="${t.coverUrl}" width="40" height="40" style="border-radius: 6px; display: block; object-fit: cover;" />` : `<div style="width:40px; height:40px; background-color:#2c2c2e; border-radius: 6px;"></div>`}
                </td>
                <td style="padding: 10px 0; padding-left: 10px; text-align: left;">
                  <div style="color: #ffffff; font-size: 14px; font-weight: 600;">${t.title}</div>
                  <div style="color: #94a3b8; font-size: 12px;">${t.artistName}</div>
                </td>
                <td align="right" style="padding: 10px 0; color: #f43f5e; font-weight: 600; font-size: 13px;">
                  ${t.playCount} plays (${t.durationMins}m)
                </td>
              </tr>
            `).join('')}
          </table>
        </div>
      `;
    }

    let topAlbumsHtml = '';
    if (stats.topAlbums && stats.topAlbums.length > 0) {
      topAlbumsHtml = `
        <div style="background-color: #111118; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 24px; margin-bottom: 30px;">
          <h2 style="color: #ffffff; font-size: 16px; font-weight: 600; margin: 0 0 16px 0; text-transform: uppercase; letter-spacing: 1px;">Top Albums This Week</h2>
          <table width="100%" cellpadding="0" cellspacing="0">
            ${stats.topAlbums.map((alb, idx) => `
              <tr style="${idx > 0 ? 'border-top: 1px solid rgba(255,255,255,0.06);' : ''}">
                <td style="padding: 10px 0; color: #ffffff; font-weight: 600; font-size: 14px;" width="30">#${idx + 1}</td>
                <td style="padding: 10px 0;" width="50">
                  ${alb.coverUrl ? `<img src="${alb.coverUrl}" width="40" height="40" style="border-radius: 6px; display: block; object-fit: cover;" />` : `<div style="width:40px; height:40px; background-color:#2c2c2e; border-radius: 6px;"></div>`}
                </td>
                <td style="padding: 10px 0; padding-left: 10px; text-align: left;">
                  <div style="color: #ffffff; font-size: 14px; font-weight: 600;">${alb.title}</div>
                  <div style="color: #94a3b8; font-size: 12px;">by ${alb.artistName}</div>
                </td>
                <td align="right" style="padding: 10px 0; color: #ffffff; font-weight: 500; font-size: 13px;">
                  ${alb.playCount} plays (${alb.durationMins}m)
                </td>
              </tr>
            `).join('')}
          </table>
        </div>
      `;
    }

    let topArtistsHtml = '';
    if (stats.top3Artists && stats.top3Artists.length > 0) {
      topArtistsHtml = `
        <div style="background-color: #111118; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 24px; margin-bottom: 30px;">
          <h2 style="color: #ffffff; font-size: 16px; font-weight: 600; margin: 0 0 16px 0; text-transform: uppercase; letter-spacing: 1px;">Top 3 Artists This Week</h2>
          <table width="100%" cellpadding="0" cellspacing="0">
            ${stats.top3Artists.map((art, idx) => `
              <tr style="${idx > 0 ? 'border-top: 1px solid rgba(255,255,255,0.06);' : ''}">
                <td style="padding: 10px 0; color: #ffffff; font-weight: 600; font-size: 14px;" width="30">#${idx + 1}</td>
                <td style="padding: 10px 0;" width="50">
                  ${art.imageUrl ? `<img src="${art.imageUrl}" width="40" height="40" style="border-radius: 20px; display: block; object-fit: cover;" />` : `<div style="width:40px; height:40px; background-color:#2c2c2e; border-radius: 20px;"></div>`}
                </td>
                <td style="padding: 10px 0; padding-left: 10px; text-align: left;">
                  <span style="color: #f43f5e; font-size: 14px; font-weight: 600;">${art.name}</span>
                </td>
                <td align="right" style="padding: 10px 0; color: #ffffff; font-weight: 500; font-size: 13px;">
                  ${art.playCount} plays (${art.durationMins}m)
                </td>
              </tr>
            `).join('')}
          </table>
        </div>
      `;
    }

    let newFavouritesHtml = '';
    if (stats.newFavourites && stats.newFavourites.length > 0) {
      newFavouritesHtml = `
        <div style="background-color: #111118; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 24px; margin-bottom: 30px;">
          <h2 style="color: #ffffff; font-size: 16px; font-weight: 600; margin: 0 0 16px 0; text-transform: uppercase; letter-spacing: 1px;">New Favorites Added</h2>
          <table width="100%" cellpadding="0" cellspacing="0">
            ${stats.newFavourites.map((fav, idx) => `
              <tr style="${idx > 0 ? 'border-top: 1px solid rgba(255,255,255,0.06);' : ''}">
                <td style="padding: 10px 0;" width="50">
                  ${fav.coverUrl ? `<img src="${fav.coverUrl}" width="40" height="40" style="border-radius: 6px; display: block; object-fit: cover;" />` : `<div style="width:40px; height:40px; background-color:#2c2c2e; border-radius: 6px;"></div>`}
                </td>
                <td style="padding: 10px 0; padding-left: 10px; text-align: left;">
                  <div style="color: #ffffff; font-size: 14px; font-weight: 600;">${fav.title}</div>
                  <div style="color: #94a3b8; font-size: 12px;">${fav.artistName}</div>
                </td>
                <td align="right" style="padding: 10px 0; color: #94a3b8; font-size: 11px;">
                  Liked ${new Date(fav.addedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </td>
              </tr>
            `).join('')}
          </table>
        </div>
      `;
    }

    let followedReleasesHtml = '';
    if (stats.newReleasesFromFollowed && stats.newReleasesFromFollowed.length > 0) {
      followedReleasesHtml = `
        <div style="background-color: #111118; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 24px; margin-bottom: 30px;">
          <h2 style="color: #ffffff; font-size: 16px; font-weight: 600; margin: 0 0 16px 0; text-transform: uppercase; letter-spacing: 1px;">New Releases From Followed Artists</h2>
          <table width="100%" cellpadding="0" cellspacing="0">
            ${stats.newReleasesFromFollowed.map((rel, idx) => `
              <tr style="${idx > 0 ? 'border-top: 1px solid rgba(255,255,255,0.06);' : ''}">
                <td style="padding: 12px 0;" width="50">
                  ${rel.coverUrl ? `<img src="${rel.coverUrl}" width="40" height="40" style="border-radius: 6px; display: block; object-fit: cover;" />` : `<div style="width:40px; height:40px; background-color:#2c2c2e; border-radius: 6px;"></div>`}
                </td>
                <td style="padding: 12px 0; padding-left: 10px; text-align: left;">
                  <div style="color: #ffffff; font-size: 14px; font-weight: 600;">${rel.title}</div>
                  <div style="color: #94a3b8; font-size: 12px;">by ${rel.artist?.name || 'Unknown Artist'}</div>
                </td>
                <td align="right" style="padding: 12px 0;">
                  <a href="${config.FRONTEND_URL}/search" style="background-color: #f43f5e; color: #ffffff; padding: 6px 12px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 11px; display: inline-block;">▶ Play</a>
                </td>
              </tr>
            `).join('')}
          </table>
        </div>
      `;
    }

    let scheduledReleasesHtml = '';
    if (stats.scheduledSongs && stats.scheduledSongs.length > 0) {
      scheduledReleasesHtml = `
        <div style="background-color: #111118; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 24px; margin-bottom: 30px;">
          <h2 style="color: #ffffff; font-size: 16px; font-weight: 600; margin: 0 0 16px 0; text-transform: uppercase; letter-spacing: 1px;">Your Scheduled Releases</h2>
          <table width="100%" cellpadding="0" cellspacing="0">
            ${stats.scheduledSongs.map((s, idx) => `
              <tr style="${idx > 0 ? 'border-top: 1px solid rgba(255,255,255,0.06);' : ''}">
                <td style="padding: 12px 0; text-align: left;">
                  <div style="color: #ffffff; font-size: 14px; font-weight: 600;">${s.title}</div>
                  <div style="color: #94a3b8; font-size: 12px;">Scheduled: ${new Date(s.scheduledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                </td>
                <td align="right" style="padding: 12px 0;" width="100">
                  <a href="${config.FRONTEND_URL}/artist/releases" style="background-color: #f43f5e; color: #ffffff; padding: 6px 12px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 11px; display: inline-block;">✏ Edit Release</a>
                </td>
              </tr>
            `).join('')}
          </table>
        </div>
      `;
    }

    const html = this.getEmailTemplate(aiContent.subject, `
      <div style="padding: 0 10px;">
        <!-- Persona Banner -->
        <div style="background: linear-gradient(135deg, #f43f5e 0%, #8b5cf6 100%); border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px; box-shadow: 0 10px 25px rgba(139,92,246,0.3);">
          <span style="color: #ffffff; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">Your Weekly Music Persona</span>
          <h1 style="color: #ffffff; font-size: 26px; font-weight: 800; margin: 6px 0 0 0; font-family: 'Nunito', sans-serif; text-shadow: 0 2px 4px rgba(0,0,0,0.2);">${aiContent.persona}</h1>
        </div>

        <!-- Header Message -->
        <div style="margin-bottom: 24px; text-align: center;">
          <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6; margin: 0 0 8px 0; font-weight: 400;">${aiContent.intro}</p>
        </div>

        <!-- Section 1: Stats Grid -->
        ${statsGrid}

        <!-- Section 2: Top Tracks -->
        ${top5Html}

        <!-- Section 3: Top Albums -->
        ${topAlbumsHtml}

        <!-- Section 3b: Top Artists -->
        ${topArtistsHtml}

        <!-- Section 4: New Favorites -->
        ${newFavouritesHtml}

        <!-- Section 5: Listening Patterns -->
        <div style="background-color: #111118; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 24px; margin-bottom: 30px;">
          <h2 style="color: #ffffff; font-size: 16px; font-weight: 600; margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: 1px;">Listening Vibe & Patterns</h2>
          <p style="color: #e2e8f0; font-size: 14px; line-height: 1.6; margin: 0; font-style: italic; border-left: 2px solid #f43f5e; padding-left: 12px;">
            "${aiContent.insight}"
          </p>
        </div>

        <!-- Section 6: Followed Releases -->
        ${followedReleasesHtml}

        <!-- Section 7: Scheduled Releases -->
        ${scheduledReleasesHtml}

        <!-- Section 8: Platform Updates -->
        <div style="background-color: #111118; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 24px; margin-bottom: 30px; text-align: center;">
          <h2 style="color: #ffffff; font-size: 16px; font-weight: 600; margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: 1px;">Platform Updates</h2>
          <p style="color: #94a3b8; font-size: 13px; line-height: 1.6; margin: 0 0 20px 0;">
            ${aiContent.updatesBlurb}
          </p>
          <a href="https://listenzenify.vercel.app" style="background-color: #f43f5e; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">🎵 Visit Zenify</a>
        </div>
      </div>
    `);

    return await this.send({ to, subject: aiContent.subject, html });
  }

  static async sendNewReleaseAlert(to: string, username: string, track: { 
    title: string; 
    artist?: string; 
    artistName?: string;
    coverUrl?: string; 
    type: string;
    genre?: string;
    composers?: string;
    producers?: string;
    copyrightLabel?: string;
    price?: number;
    allowDownloads?: boolean;
    createdAt?: Date;
    scheduledAt?: Date;
  }) {
    const artist = track.artist || track.artistName || 'Unknown Artist';
    let aiContent = {
      subject: `New music from ${artist} — "${track.title}"`,
      intro: `Hi ${username}, look who just dropped some fresh sound.`,
      promo: `A brand new ${track.type.toLowerCase()} has just hit Zenify. Immerse yourself in the composition of "${track.title}" by ${artist}.`,
      outro: `Play it now on your favorite audio platform.`
    };

    try {
      const prompt = `You are the AI copywriter for Zenify. Write a personalized new release notification email to the listener ${username}.
Song details:
- Title: "${track.title}"
- Artist: "${artist}"
- Genre: "${track.genre || 'N/A'}"
- Type: "${track.type || 'single'}"
- Composers: "${track.composers || 'N/A'}"
- Producers: "${track.producers || 'N/A'}"
- Production Label: "${track.copyrightLabel || 'N/A'}"

Write in Zenify's voice: modern, music-focused, warm but not corporate.
Return ONLY a raw JSON object with the schema:
{
  "subject": "A creative dynamic subject line (e.g. 'Raga of Revenge just dropped — Anirudh's latest is here')",
  "intro": "1-2 sentences opening line greeting the user and announcing the track",
  "promo": "2-3 sentences description of this track, why it is unique, and why it appeals to their taste",
  "outro": "1 sentence closing call to play"
}
Do not include markdown or backticks. Just raw JSON.`;
      const res = await askAI(prompt, DEFAULT_MODEL);
      const cleanJson = res.replace(/```json/g, '').replace(/```/g, '').trim();
      aiContent = JSON.parse(cleanJson);
    } catch (err) {
      console.error('[Mail] New Release AI generation failure:', err);
    }

    const html = this.getEmailTemplate(aiContent.subject, `
      <div style="background-color: #111118; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 40px; margin-bottom: 30px;">
        <h1 style="color: #ffffff; font-size: 24px; font-weight: 700; margin: 0 0 16px 0; text-align: center;">New Release Alert</h1>
        <p style="color: #e2e8f0; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">${aiContent.intro}</p>
        <p style="color: #e2e8f0; font-size: 15px; line-height: 1.6; margin: 0 0 30px 0; font-style: italic; border-left: 2px solid #f43f5e; padding-left: 12px;">
          "${aiContent.promo}"
        </p>

        <!-- Song Card Block -->
        <div style="background-color: #0a0a0f; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 28px; text-align: center; margin-bottom: 30px;">
          ${track.coverUrl ? `<img src="${track.coverUrl}" alt="Song Cover" width="200" height="200" style="border-radius: 10px; margin-bottom: 20px; object-fit: cover; box-shadow: 0 8px 20px rgba(0,0,0,0.5);" />` : ''}
          <h2 style="color: #ffffff; font-size: 20px; font-weight: 700; margin: 0 0 4px 0;">${track.title}</h2>
          <p style="color: #f43f5e; font-size: 15px; font-weight: 600; margin: 0 0 20px 0; font-family: 'Inter', sans-serif;">${artist}</p>
          
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 20px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 16px; text-align: left;">
            <tr>
              <td style="color: #94a3b8; font-size: 12px; font-weight: 500; text-transform: uppercase; padding: 6px 0;">Release Type</td>
              <td align="right" style="color: #ffffff; font-size: 13px; font-weight: 500; padding: 6px 0;">${track.type || 'Single'}</td>
            </tr>
            <tr>
              <td style="color: #94a3b8; font-size: 12px; font-weight: 500; text-transform: uppercase; padding: 6px 0;">Primary Genre</td>
              <td align="right" style="color: #ffffff; font-size: 13px; font-weight: 500; padding: 6px 0;">${track.genre || 'N/A'}</td>
            </tr>
            <tr>
              <td style="color: #94a3b8; font-size: 12px; font-weight: 500; text-transform: uppercase; padding: 6px 0;">Composer(s)</td>
              <td align="right" style="color: #ffffff; font-size: 13px; font-weight: 500; padding: 6px 0;">${track.composers || 'N/A'}</td>
            </tr>
            <tr>
              <td style="color: #94a3b8; font-size: 12px; font-weight: 500; text-transform: uppercase; padding: 6px 0;">Producer(s)</td>
              <td align="right" style="color: #ffffff; font-size: 13px; font-weight: 500; padding: 6px 0;">${track.producers || 'N/A'}</td>
            </tr>
            <tr>
              <td style="color: #94a3b8; font-size: 12px; font-weight: 500; text-transform: uppercase; padding: 6px 0;">Record Label</td>
              <td align="right" style="color: #ffffff; font-size: 13px; font-weight: 500; padding: 6px 0;">${track.copyrightLabel || 'N/A'}</td>
            </tr>
            <tr>
              <td style="color: #94a3b8; font-size: 12px; font-weight: 500; text-transform: uppercase; padding: 6px 0;">Price</td>
              <td align="right" style="color: #f43f5e; font-size: 13px; font-weight: 600; padding: 6px 0;">${track.price && track.price > 0 ? `₹${track.price}` : 'Free / Streaming'}</td>
            </tr>
            <tr>
              <td style="color: #94a3b8; font-size: 12px; font-weight: 500; text-transform: uppercase; padding: 6px 0;">Availability</td>
              <td align="right" style="color: #ffffff; font-size: 13px; font-weight: 500; padding: 6px 0;">${track.allowDownloads !== false ? 'Streaming & Download' : 'Streaming Only'}</td>
            </tr>
            <tr>
              <td style="color: #94a3b8; font-size: 12px; font-weight: 500; text-transform: uppercase; padding: 6px 0;">Release Date</td>
              <td align="right" style="color: #ffffff; font-size: 13px; font-weight: 500; padding: 6px 0;">${new Date(track.scheduledAt || track.createdAt || Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
            </tr>
          </table>
        </div>

        <div style="text-align: center; margin-bottom: 12px;">
          <a href="${config.FRONTEND_URL}/search" style="background-color: #f43f5e; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">▶ Play Now on Zenify</a>
        </div>
      </div>
    `);

    return await this.send({ to, subject: aiContent.subject, html });
  }

  static async sendScheduledReleaseReminder(to: string, username: string, track: {
    title: string;
    coverUrl?: string;
    type: string;
    genre?: string;
    duration?: number;
    featuredArtists?: string;
    scheduledAt?: Date | string | null;
  }, checklist: {
    coverArt: boolean;
    audioProcessed: boolean;
    metadataComplete: boolean;
    missing: string[];
  }) {
    const scheduledDateObj = track.scheduledAt ? new Date(track.scheduledAt) : new Date(Date.now() + 24 * 60 * 60 * 1000);
    const scheduledTimeStr = scheduledDateObj.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    let aiContent = {
      subject: `24 hours to go — "${track.title}" drops tomorrow`,
      intro: `Your upcoming release is almost live on Zenify.`,
      body: `Get ready to share "${track.title}" with your listeners. Let's make sure everything is polished before launch.`
    };

    try {
      const prompt = `You are the AI copywriter for Zenify. Write the scheduled release reminder email copy for artist "${username}".
Track details:
- Title: "${track.title}"
- Genre: "${track.genre || 'N/A'}"
- Type: "${track.type}"
- Scheduled Live Date/Time: "${scheduledTimeStr}"

Write in Zenify's voice: modern, music-focused, warm.
Return ONLY a raw JSON object with the schema:
{
  "subject": "A creative subject line highlighting the 24-hour countdown (e.g. '24 hours to go — Vairam drops tomorrow')",
  "intro": "1-2 sentences warm opening greeting the artist",
  "body": "2-3 sentences hyping the artist about the song release, referencing the track details and genre"
}
Do not include markdown. Just raw JSON.`;
      const res = await askAI(prompt, DEFAULT_MODEL);
      const cleanJson = res.replace(/```json/g, '').replace(/```/g, '').trim();
      aiContent = JSON.parse(cleanJson);
    } catch (err) {
      console.error('[Mail] Scheduled Release Reminder AI generation failure:', err);
    }

    const durationMins = track.duration ? `${Math.floor(track.duration / 60)}m ${track.duration % 60}s` : 'N/A';

    const checklistHtml = `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 16px; text-align: left;">
        <tr>
          <td style="padding: 8px 0; color: #ffffff; font-size: 14px;">
            ${checklist.coverArt ? '✅ Cover art uploaded' : '❌ Missing: Cover art'}
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #ffffff; font-size: 14px;">
            ${checklist.audioProcessed ? '✅ Audio file processed' : '❌ Missing: Audio file'}
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #ffffff; font-size: 14px;">
            ${checklist.metadataComplete ? '✅ Metadata complete' : '❌ Missing: Metadata details'}
          </td>
        </tr>
        ${checklist.missing && checklist.missing.length > 0 ? `
          <tr>
            <td style="padding: 8px 0; color: #f43f5e; font-size: 13px; font-weight: 600;">
              Required updates: ${checklist.missing.join(', ')}
            </td>
          </tr>
        ` : ''}
      </table>
    `;

    const html = this.getEmailTemplate(aiContent.subject, `
      <div style="background-color: #111118; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 40px; margin-bottom: 30px;">
        <h1 style="color: #ffffff; font-size: 24px; font-weight: 700; margin: 0 0 16px 0; text-align: center;">Your Release Is Almost Live</h1>
        <p style="color: #e2e8f0; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">Hi ${username},</p>
        <p style="color: #e2e8f0; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">${aiContent.intro}</p>
        <p style="color: #e2e8f0; font-size: 15px; line-height: 1.6; margin: 0 0 30px 0;">${aiContent.body}</p>

        <!-- Release Card Block -->
        <div style="background-color: #0a0a0f; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 30px;">
          ${track.coverUrl ? `<img src="${track.coverUrl}" alt="Song Cover" width="180" height="180" style="border-radius: 10px; margin-bottom: 16px; object-fit: cover;" />` : ''}
          <h2 style="color: #ffffff; font-size: 18px; font-weight: 700; margin: 0 0 4px 0;">${track.title}</h2>
          <p style="color: #94a3b8; font-size: 12px; text-transform: uppercase; font-weight: 600; margin: 0 0 16px 0;">${track.type}</p>
          
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 16px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 12px; text-align: left;">
            <tr>
              <td style="color: #94a3b8; font-size: 12px; padding: 4px 0;">Release Time</td>
              <td align="right" style="color: #ffffff; font-size: 13px; font-weight: 500; padding: 4px 0;">${scheduledTimeStr}</td>
            </tr>
            <tr>
              <td style="color: #94a3b8; font-size: 12px; padding: 4px 0;">Primary Genre</td>
              <td align="right" style="color: #ffffff; font-size: 13px; font-weight: 500; padding: 4px 0;">${track.genre || 'N/A'}</td>
            </tr>
            <tr>
              <td style="color: #94a3b8; font-size: 12px; padding: 4px 0;">Duration</td>
              <td align="right" style="color: #ffffff; font-size: 13px; font-weight: 500; padding: 4px 0;">${durationMins}</td>
            </tr>
            ${track.featuredArtists ? `
              <tr>
                <td style="color: #94a3b8; font-size: 12px; padding: 4px 0;">Featuring</td>
                <td align="right" style="color: #ffffff; font-size: 13px; font-weight: 500; padding: 4px 0;">${track.featuredArtists}</td>
              </tr>
            ` : ''}
          </table>
        </div>

        <!-- Checklist Block -->
        <div style="background-color: #0a0a0f; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 24px; margin-bottom: 30px;">
          <h3 style="color: #ffffff; font-size: 14px; font-weight: 600; margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: 1px;">Pre-Release Checklist</h3>
          ${checklistHtml}
        </div>

        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center" style="padding-bottom: 12px;">
              <a href="${config.FRONTEND_URL}/artist/releases" style="background-color: #f43f5e; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">✏ Edit Release Details</a>
            </td>
          </tr>
          <tr>
            <td align="center">
              <a href="${config.FRONTEND_URL}/artist/releases" style="background-color: rgba(255,255,255,0.08); color: #ffffff; border: 1px solid rgba(255,255,255,0.15); padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">👁 Preview Release Page</a>
            </td>
          </tr>
        </table>
      </div>
    `);

    return await this.send({ to, subject: aiContent.subject, html });
  }

  static async sendReleaseLiveConfirmation(to: string, username: string, track: {
    id: string;
    title: string;
    coverUrl?: string;
    type: string;
    genre?: string;
    duration?: number;
  }, stats?: {
    streamsFirstHour: number;
    listenersFirstHour: number;
  }) {
    let aiContent = {
      subject: `It's live — "${track.title}" is now streaming on Zenify`,
      intro: `Congratulations ${username}! Your new release is live.`,
      body: `Your track "${track.title}" has officially launched on Zenify. Listeners can now stream, buy, and enjoy your work.`
    };

    try {
      const prompt = `You are the AI copywriter for Zenify. Write the release live confirmation email for artist "${username}".
Song details:
- Title: "${track.title}"
- Genre: "${track.genre || 'N/A'}"
- Type: "${track.type}"

Write in Zenify's voice: modern, music-focused, warm, congratulatory.
Return ONLY a raw JSON object with the schema:
{
  "subject": "A creative congratulatory subject line (e.g. 'It's live. Vairam is now streaming on Zenify')",
  "intro": "1-2 sentences congratulatory opening greeting the artist",
  "body": "2-3 sentences of copy hyping the live status and encouraging them to share the track with fans"
}
Do not include markdown. Just raw JSON.`;
      const res = await askAI(prompt, DEFAULT_MODEL);
      const cleanJson = res.replace(/```json/g, '').replace(/```/g, '').trim();
      aiContent = JSON.parse(cleanJson);
    } catch (err) {
      console.error('[Mail] Release Live Confirmation AI generation failure:', err);
    }

    const durationMins = track.duration ? `${Math.floor(track.duration / 60)}m ${track.duration % 60}s` : 'N/A';

    let statsHtml = '';
    if (stats) {
      statsHtml = `
        <div style="background-color: #0a0a0f; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 24px; margin-bottom: 30px;">
          <h3 style="color: #ffffff; font-size: 14px; font-weight: 600; margin: 0 0 16px 0; text-transform: uppercase; letter-spacing: 1px; text-align: center;">First Hour Performance</h3>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="50%" align="center">
                <div style="color: #94a3b8; font-size: 11px; font-weight: 500; text-transform: uppercase;">Streams</div>
                <div style="color: #f43f5e; font-size: 24px; font-weight: 700; margin-top: 4px;">${stats.streamsFirstHour}</div>
              </td>
              <td width="50%" align="center" style="border-left: 1px solid rgba(255,255,255,0.08);">
                <div style="color: #94a3b8; font-size: 11px; font-weight: 500; text-transform: uppercase;">Listeners</div>
                <div style="color: #f43f5e; font-size: 24px; font-weight: 700; margin-top: 4px;">${stats.listenersFirstHour}</div>
              </td>
            </tr>
          </table>
        </div>
      `;
    }

    const html = this.getEmailTemplate(aiContent.subject, `
      <div style="background-color: #111118; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 40px; margin-bottom: 30px;">
        <!-- LIVE Badge -->
        <div style="text-align: center; margin-bottom: 20px;">
          <span style="background-color: rgba(244, 63, 94, 0.1); color: #f43f5e; border: 1px solid #f43f5e; border-radius: 4px; padding: 4px 12px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">● LIVE NOW</span>
        </div>
        
        <h1 style="color: #ffffff; font-size: 24px; font-weight: 700; margin: 0 0 16px 0; text-align: center;">Your Sound is Live</h1>
        <p style="color: #e2e8f0; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">Hi ${username},</p>
        <p style="color: #e2e8f0; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">${aiContent.intro}</p>
        <p style="color: #e2e8f0; font-size: 15px; line-height: 1.6; margin: 0 0 30px 0;">${aiContent.body}</p>

        <!-- Release Card Block -->
        <div style="background-color: #0a0a0f; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 30px;">
          ${track.coverUrl ? `<img src="${track.coverUrl}" alt="Song Cover" width="180" height="180" style="border-radius: 10px; margin-bottom: 16px; object-fit: cover;" />` : ''}
          <h2 style="color: #ffffff; font-size: 18px; font-weight: 700; margin: 0 0 4px 0;">${track.title}</h2>
          <p style="color: #f43f5e; font-size: 14px; font-weight: 600; margin: 0 0 12px 0;">${username}</p>
          
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 16px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 12px; text-align: left;">
            <tr>
              <td style="color: #94a3b8; font-size: 12px; padding: 4px 0;">Type</td>
              <td align="right" style="color: #ffffff; font-size: 13px; font-weight: 500; padding: 4px 0;">${track.type}</td>
            </tr>
            <tr>
              <td style="color: #94a3b8; font-size: 12px; padding: 4px 0;">Genre</td>
              <td align="right" style="color: #ffffff; font-size: 13px; font-weight: 500; padding: 4px 0;">${track.genre || 'N/A'}</td>
            </tr>
            <tr>
              <td style="color: #94a3b8; font-size: 12px; padding: 4px 0;">Duration</td>
              <td align="right" style="color: #ffffff; font-size: 13px; font-weight: 500; padding: 4px 0;">${durationMins}</td>
            </tr>
          </table>
        </div>

        <!-- First Hour Stats -->
        ${statsHtml}

        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center" style="padding-bottom: 12px;">
              <a href="${config.FRONTEND_URL}/track/${track.id}" style="background-color: #f43f5e; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">▶ Listen Now</a>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom: 12px;">
              <a href="${config.FRONTEND_URL}/artist/analytics" style="background-color: rgba(255,255,255,0.08); color: #ffffff; border: 1px solid rgba(255,255,255,0.15); padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">📊 View Stream Stats</a>
            </td>
          </tr>
          <tr>
            <td align="center">
              <a href="${config.FRONTEND_URL}/track/${track.id}" style="background-color: rgba(255,255,255,0.08); color: #ffffff; border: 1px solid rgba(255,255,255,0.15); padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">🔗 Share Your Release</a>
            </td>
          </tr>
        </table>
      </div>
    `);

    return await this.send({ to, subject: aiContent.subject, html });
  }
}
