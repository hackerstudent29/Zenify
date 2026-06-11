/**
 * Quick script to send a demo Zenify welcome email.
 * Usage: npx ts-node src/scripts/send_demo_mail.ts <email>
 */
import dotenv from 'dotenv';
dotenv.config();

const axios = require('axios');

const BREVO_API_KEY = process.env.BREVO_API_KEY!;
const BREVO_FROM_EMAIL = process.env.BREVO_FROM_EMAIL || 'onboarding@brevo.com';

const to = process.argv[2] || 'test@example.com';

const LOGO_URL = 'https://res.cloudinary.com/dzqcuxchc/image/upload/v1779805544/zenify/brand/zenify_logo_purple_pink.png';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://listenzenify.vercel.app';

const html = `
<div style="background-color: #0B0C0F; background-image: radial-gradient(circle at center top, #1c1c1e, #0B0C0F 60%); padding: 60px 0; width: 100%; font-family: Inter, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" align="center" style="max-width: 560px; background-color: transparent;">
    <!-- LOGO -->
    <tr>
      <td align="center" style="padding: 30px 0;">
        <img 
          src="${LOGO_URL}"
          alt="Zenify"
          width="220"
          height="81"
          style="display: block; margin: 0 auto; width: 220px; height: 81px; border: 0;"
        />
      </td>
    </tr>
    <!-- Header Section -->
    <tr>
      <td style="text-align: center; padding: 0 40px;">
        <h1 style="color: #ffffff; font-family: 'Playfair Display', Canela, serif; font-size: 34px; font-weight: 500; letter-spacing: 1.5px; margin: 0 0 40px 0;">Welcome to the Future of <span style="color: #f43f5e; font-style: italic;">Sound.</span></h1>
        <div style="height: 1px; width: 100%; background-color: #2c2c2e; margin: 0 auto 40px auto;"></div>
      </td>
    </tr>
    <!-- Body text -->
    <tr>
      <td style="padding: 0 40px; text-align: center;">
        <p style="color: #E8E6E1; font-size: 17px; line-height: 1.7; margin: 0 0 24px 0; font-weight: 300;">Hi there,</p>
        <p style="color: #E8E6E1; font-size: 17px; line-height: 1.7; margin: 0 0 24px 0; font-weight: 300;">This is a <strong style="color:#f43f5e;">demo email</strong> from <span style="font-family: 'Hi', 'Nunito', 'Quicksand', sans-serif; font-weight: 700; letter-spacing: -0.5px; text-transform: lowercase;">zenify</span> — your premium music streaming platform.</p>
        <p style="color: #E8E6E1; font-size: 17px; line-height: 1.7; margin: 0 0 24px 0; font-weight: 300;"><span style="font-family: 'Hi', 'Nunito', 'Quicksand', sans-serif; font-weight: 700; letter-spacing: -0.5px; text-transform: lowercase;">zenify</span> is now ready for you — millions of songs, uninterrupted listening, and sound crafted with studio-level precision. Every detail. Every layer. Every note exactly as it was meant to be heard.</p>
        <p style="color: #E8E6E1; font-size: 17px; line-height: 1.7; margin: 0 0 24px 0; font-weight: 300;">This is more than streaming.<br/>This is immersion.</p>
        <p style="color: #E8E6E1; font-size: 17px; line-height: 1.7; margin: 0 0 48px 0; font-weight: 300;">Your account is active, and your space is waiting.</p>
        
        <a href="${FRONTEND_URL}" style="background-color: #f43f5e; color: #ffffff; padding: 18px 50px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block; letter-spacing: 0.5px; box-shadow: 0 4px 15px rgba(244, 63, 94, 0.2);">Start Listening</a>
        
        <p style="color: #E8E6E1; font-size: 15px; line-height: 1.7; margin: 48px 0 8px 0; font-weight: 300;">Press play.</p>
        <p style="color: #E8E6E1; font-size: 15px; line-height: 1.7; margin: 0 0 48px 0; font-weight: 300;">Let the music take over.</p>
        
        <div style="height: 1px; width: 100%; background-color: #2c2c2e; margin: 0 auto 40px auto;"></div>
      </td>
    </tr>
    <!-- Footer -->
    <tr>
      <td style="padding: 0 40px; text-align: center;">
        <p style="color: #8e8e93; font-size: 13px; margin: 0 0 8px 0; font-weight: 400;">&mdash; Zenify Music Group</p>
        <p style="color: #8e8e93; font-size: 13px; margin: 0 0 24px 0; font-weight: 400;">Music. Engineered for Depth.</p>
        <p style="color: #48484a; font-size: 11px; margin: 0 0 24px 0;">Designed by Zendrum Team &bull; ${new Date().getFullYear()}</p>
        <p style="color: #3a3a3c; font-size: 10px; line-height: 1.5;">You're receiving this email because you created a Zenify account.</p>
      </td>
    </tr>
  </table>
</div>`;

async function main() {
    console.log(`Sending demo email to: ${to}`);
    
    const res = await axios.post(
        'https://api.brevo.com/v3/smtp/email',
        {
            sender: { name: 'Zenify', email: BREVO_FROM_EMAIL },
            to: [{ email: to }],
            subject: '🎵 Demo: Welcome to Zenify — Your Sound Begins Now',
            htmlContent: html,
        },
        {
            headers: {
                'api-key': BREVO_API_KEY,
                'content-type': 'application/json',
                'accept': 'application/json',
            },
        }
    );

    console.log('✅ Email sent! Message ID:', res.data.messageId);
}

main().catch(err => {
    console.error('❌ Failed to send email:', err.response?.data || err.message);
    process.exit(1);
});
