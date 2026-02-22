import nodemailer from 'nodemailer';
import { config } from '../config/env';

export class MailService {
  private static transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth: {
      user: config.SMTP_USER,
      pass: config.SMTP_PASS,
    },
  });

  static async sendOTP(to: string, otp: string) {
    const content = `
<div style="background-color: #0B0C0F; padding: 60px 0; width: 100%; font-family: Inter, -apple-system, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" align="center" style="max-width: 560px;">
    <tr>
      <td align="center" style="padding: 30px 0;">
        <img src="http://localhost:3000/public/logo.png" alt="Zenify" width="80" height="80" style="display: block; border-radius: 20px;" />
      </td>
    </tr>
    <tr>
      <td style="text-align: center; padding: 0 40px;">
        <h1 style="color: #ffffff; font-size: 30px; font-weight: 500; margin: 0 0 16px 0; letter-spacing: -0.02em;">Verify your identity</h1>
        <p style="color: #E8E6E1; font-size: 16px; line-height: 1.6; margin: 0 0 40px 0; font-weight: 300;">To keep your Zenify experience secure, please enter the following verification code.</p>
        
        <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 40px;">
            <tr>
                <td style="background-color: #171719; border: 1px solid #2c2c2e; border-radius: 12px; padding: 20px 40px; color: #f43f5e; font-family: 'SF Mono', monospace; font-size: 40px; font-weight: 500; letter-spacing: 6px;">
                    ${otp}
                </td>
            </tr>
        </table>
        
        <p style="color: #8e8e93; font-size: 13px; margin: 0;">This code is valid for 10 minutes. If you didn't request this, please ignore this email.</p>
      </td>
    </tr>
  </table>
</div>`;

    return await this.transporter.sendMail({
      from: `"Zenify" <${config.SMTP_USER}>`,
      to,
      subject: 'Your Verification Code',
      html: content,
    });
  }

  static async sendWelcome(to: string, name?: string) {
    const content = `
<div style="background-color: #0B0C0F; background-image: radial-gradient(circle at center top, #1c1c1e, #0B0C0F 60%); padding: 60px 0; width: 100%; font-family: Inter, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" align="center" style="max-width: 560px; background-color: transparent;">
    <!-- LOGO -->
    <tr>
      <td align="center" style="padding: 30px 0;">
        <img 
          src="http://localhost:3000/public/logo.png"
          alt="Zenify"
          width="80"
          height="80"
          style="display: block; border-radius: 20px; box-shadow: 0 0 20px rgba(255,255,255,0.05);"
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
        <p style="color: #E8E6E1; font-size: 17px; line-height: 1.7; margin: 0 0 24px 0; font-weight: 300;">Hi ${name || 'there'},</p>
        <p style="color: #E8E6E1; font-size: 17px; line-height: 1.7; margin: 0 0 24px 0; font-weight: 300;">Today, your journey begins.</p>
        <p style="color: #E8E6E1; font-size: 17px; line-height: 1.7; margin: 0 0 24px 0; font-weight: 300;">Zenify is now ready for you &mdash; millions of songs, uninterrupted listening, and sound crafted with studio-level precision. Every detail. Every layer. Every note exactly as it was meant to be heard.</p>
        <p style="color: #E8E6E1; font-size: 17px; line-height: 1.7; margin: 0 0 24px 0; font-weight: 300;">This is more than streaming.<br/>This is immersion.</p>
        <p style="color: #E8E6E1; font-size: 17px; line-height: 1.7; margin: 0 0 48px 0; font-weight: 300;">Your account is active, and your space is waiting.</p>
        
        <a href="${config.FRONTEND_URL}" style="background-color: #f43f5e; color: #ffffff; padding: 18px 50px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block; letter-spacing: 0.5px; box-shadow: 0 4px 15px rgba(244, 63, 94, 0.2);">Start Listening</a>
        
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
        <p style="color: #48484a; font-size: 11px; margin: 0 0 24px 0;">Designed by Zendrum Team &bull; new Date().getFullYear()</p>
        <p style="color: #3a3a3c; font-size: 10px; line-height: 1.5;">You're receiving this email because you created a Zenify account.</p>
      </td>
    </tr>
  </table>
</div>`;

    return await this.transporter.sendMail({
      from: `"Zenify" <${config.SMTP_USER}>`,
      to,
      subject: 'Welcome to Zenify — Your Sound Begins Now',
      html: content,
    });
  }

  static async sendPurchaseConfirmation(to: string, itemName: string, amount: number, username: string, purchaseDate: Date, expiryDate?: Date) {
    const dateStr = purchaseDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr = purchaseDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const expiryStr = expiryDate ? expiryDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/A';

    const content = `
<div style="background-color: #1a1a1c; padding: 50px 0; width: 100%; font-family: Inter, -apple-system, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" align="center" style="max-width: 600px; background-color: #242426; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
    <tr>
      <td align="center" style="padding: 40px 40px 20px 40px;">
        <img src="http://localhost:3000/public/logo.png" alt="Zenify" width="80" height="80" style="display: block; border-radius: 20px;" />
        <h1 style="color: #ffffff; font-size: 24px; font-weight: 600; margin: 30px 0 10px 0; letter-spacing: 0.5px;">Welcome to Premium Sound.</h1>
      </td>
    </tr>
    <tr>
      <td style="padding: 0 40px 40px 40px;">
        <p style="color: #d1d1d6; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">Hi <span style="color: #ffffff; font-weight: 600;">${username}</span>,</p>
        <p style="color: #d1d1d6; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">Thank you for your purchase. Your subscription has been <span style="color: #f43f5e; font-weight: 600;">successfully activated</span>, and you now have full access to your selected Zenify plan.</p>
        
        <p style="color: #f43f5e; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 16px 0; font-weight: 600;">Here are your purchase details:</p>

        <div style="background-color: #111111; border: 1px solid #333333; box-shadow: 0 10px 30px rgba(244,63,94,0.05); border-radius: 12px; padding: 28px; margin-bottom: 30px;">
          <p style="color: #f43f5e; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 20px 0; font-weight: 700;">Order Summary</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="color: #8e8e93; font-size: 14px; padding-bottom: 8px;">Purchase Date:</td><td align="right" style="color: #f43f5e; font-size: 14px; font-weight: 600; padding-bottom: 8px;">${dateStr}</td></tr>
            <tr><td style="color: #8e8e93; font-size: 14px; padding-bottom: 24px; border-bottom: 1px solid #3a3a3c;">Purchase Time:</td><td align="right" style="color: #f43f5e; font-size: 14px; font-weight: 600; padding-bottom: 24px; border-bottom: 1px solid #3a3a3c;">${timeStr}</td></tr>
            
            <tr><td style="color: #8e8e93; font-size: 14px; padding: 24px 0 8px 0;">Plan:</td><td align="right" style="color: #ffffff; font-size: 14px; padding: 24px 0 8px 0; font-weight: 600;">${itemName}</td></tr>
            <tr><td style="color: #8e8e93; font-size: 14px; padding-bottom: 8px;">Plan Duration:</td><td align="right" style="color: #ffffff; font-size: 14px; padding-bottom: 8px;">1 Month</td></tr>
            <tr><td style="color: #8e8e93; font-size: 14px; padding-bottom: 24px; border-bottom: 1px solid #3a3a3c;">Plan Expiry:</td><td align="right" style="color: #ffffff; font-size: 14px; padding-bottom: 24px; border-bottom: 1px solid #3a3a3c;">${expiryStr}</td></tr>
            
            <tr><td style="color: #d1d1d6; font-size: 14px; font-weight: 600; padding-top: 24px;">Total Paid:</td><td align="right" style="color: #f43f5e; font-size: 18px; font-weight: 800; padding-top: 24px;">₹${amount.toFixed(2)}</td></tr>
          </table>
        </div>

        <p style="color: #d1d1d6; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">Your plan is now active and ready to use.<br/>You can explore your premium features anytime through your account.</p>
        <p style="color: #8e8e93; font-size: 13px; line-height: 1.5; margin: 0 0 30px 0;">Please note:<br/>All subscription purchases are final and cannot be cancelled or refunded once activated.</p>
        <p style="color: #d1d1d6; font-size: 15px; line-height: 1.6; margin: 0 0 30px 0;">If you have any questions, our support team is always here to help.</p>
        <p style="color: #d1d1d6; font-size: 15px; font-weight: 600; margin: 0 0 40px 0;">Enjoy the music.</p>
        
        <div style="height: 1px; width: 100%; background-color: #3a3a3c; margin: 0 auto 30px auto;"></div>
        
        <p style="color: #8e8e93; font-size: 13px; margin: 0 0 8px 0;">&mdash; Zenify Music Group</p>
        <p style="color: #8e8e93; font-size: 13px; margin: 0 0 20px 0;">Crafting Better Listening Experiences</p>
        <p style="color: #48484a; font-size: 11px; margin: 0 0 24px 0;">Designed by Zendrum Team &bull; new Date().getFullYear()</p>
        <p style="color: #3a3a3c; font-size: 10px; line-height: 1.4;">You are receiving this email because a subscription purchase was completed on your Zenify account.</p>
      </td>
    </tr>
  </table>
</div>`;

    return await this.transporter.sendMail({
      from: `"Zenify" <${config.SMTP_USER}>`,
      to,
      subject: 'Your Zenify Subscription Is Active 🎶',
      html: content,
    });
  }

  static async sendSubscriptionExpiryReminder(to: string, username: string, expiryDate: Date) {
    const expiryStr = expiryDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

    const content = `
<div style="background-color: #1a1a1c; padding: 50px 0; width: 100%; font-family: Inter, -apple-system, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" align="center" style="max-width: 600px; background-color: #242426; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
    <tr>
      <td align="center" style="padding: 40px 40px 20px 40px;">
        <img src="http://localhost:3000/public/logo.png" alt="Zenify" width="80" height="80" style="display: block; border-radius: 20px;" />
        <h1 style="color: #ffffff; font-size: 24px; font-weight: 600; margin: 30px 0 10px 0; letter-spacing: 0.5px;">Don't miss a beat.</h1>
      </td>
    </tr>
    <tr>
      <td style="padding: 0 40px 40px 40px;">
        <p style="color: #d1d1d6; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">Hello <span style="color: #ffffff; font-weight: 600;">${username}</span>,<br/><br/>Your Zenify Premium subscription is set to expire tomorrow on <b style="color: #f43f5e;">${expiryStr}</b>.</p>
        
        <div style="background-color: #111111; border: 1px solid #441122; border-radius: 12px; padding: 30px; margin-bottom: 30px; text-align: center; box-shadow: 0 10px 30px rgba(244,63,94,0.1);">
            <p style="color: #ffffff; font-size: 16px; font-weight: 700; margin: 0 0 12px 0; letter-spacing: 0.5px;">Keep the music flowing.</p>
            <p style="color: #aeaeb2; font-size: 14px; line-height: 1.6; margin: 0 0 28px 0;">Renew now to ensure uninterrupted access to <span style="color: #f43f5e; font-weight: 600;">high-fidelity audio</span>, ad-free streaming, and your entire library.</p>
            <a href="${config.FRONTEND_URL}/pricing" style="background-color: #f43f5e; color: #ffffff; padding: 16px 36px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px; display: inline-block; letter-spacing: 0.5px; box-shadow: 0 4px 15px rgba(244,63,94,0.3);">Renew Subscription</a>
        </div>
        
        <div style="height: 1px; width: 100%; background-color: #3a3a3c; margin: 0 auto 30px auto;"></div>
        
        <p style="color: #8e8e93; font-size: 13px; margin: 0 0 8px 0;">&mdash; Zenify Music Group</p>
        <p style="color: #8e8e93; font-size: 13px; margin: 0 0 20px 0;">Crafting Better Listening Experiences</p>
      </td>
    </tr>
  </table>
</div>`;

    return await this.transporter.sendMail({
      from: `"Zenify" <${config.SMTP_USER}>`,
      to,
      subject: 'Important: Your Zenify Premium is expiring tomorrow',
      html: content,
    });
  }

  static async sendAccountDeleted(to: string) {
    const content = `
<div style="background-color: #0B0C0F; background-image: linear-gradient(to bottom, #0B0C0F, #1c1c1e); padding: 60px 0; width: 100%; font-family: Inter, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" align="center" style="max-width: 560px; background-color: transparent;">
    <!-- LOGO -->
    <tr>
      <td align="center" style="padding: 30px 0;">
        <img 
          src="http://localhost:3000/public/logo.png"
          alt="Zenify"
          width="80"
          height="80"
          style="display: block; border-radius: 20px;"
        />
      </td>
    </tr>
    <!-- Header Section -->
    <tr>
      <td style="text-align: center; padding: 0 40px;">
        <h1 style="color: #ffffff; font-family: 'Playfair Display', Canela, serif; font-size: 32px; font-weight: 500; letter-spacing: 2px; margin: 0 0 40px 0; font-style: italic;">The Sound Fades Here.</h1>
        <div style="height: 1px; width: 100%; background-color: #3a3a3c; margin: 0 auto 40px auto;"></div>
      </td>
    </tr>
    <!-- Body text -->
    <tr>
      <td style="padding: 0 40px; text-align: left;">
        <p style="color: #E6E2DA; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0; font-weight: 300;">Hello,</p>
        <p style="color: #E6E2DA; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0; font-weight: 300;">Your Zenify account has been permanently deleted as requested.</p>
        <p style="color: #E6E2DA; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0; font-weight: 300;">All associated data &mdash; including your saved tracks, uploads, playlists, preferences, and listening history &mdash; has been securely removed from our systems. This action is final and cannot be undone.</p>
        <p style="color: #E6E2DA; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0; font-weight: 300;">We respect your decision.</p>
        <p style="color: #E6E2DA; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0; font-weight: 300;">For the time you spent creating, listening, and shaping your sound with us &mdash; thank you.</p>
        <p style="color: #E6E2DA; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0; font-weight: 300;">If you ever choose to return, you're welcome to begin again with a new account.</p>
        <p style="color: #E6E2DA; font-size: 16px; line-height: 1.6; margin: 0 0 40px 0; font-weight: 300;">Until then, the silence is intentional.</p>
        <div style="height: 1px; width: 100%; background-color: #3a3a3c; margin: 0 auto 40px auto;"></div>
      </td>
    </tr>
    <!-- Footer -->
    <tr>
      <td style="padding: 0 40px; text-align: left;">
        <p style="color: #8e8e93; font-size: 14px; margin: 0 0 8px 0; font-weight: 400;">&mdash; Zenify Music Group</p>
        <p style="color: #8e8e93; font-size: 14px; margin: 0 0 24px 0; font-weight: 400;">Music. Engineered for Depth.</p>
        <p style="color: #48484a; font-size: 12px; margin: 0 0 24px 0;">Designed by Zendrum Team &bull; 2026</p>
        <p style="color: #3a3a3c; font-size: 11px; line-height: 1.5;">You are receiving this confirmation because a deletion request was initiated for your Zenify account.</p>
      </td>
    </tr>
  </table>
</div>`;

    return await this.transporter.sendMail({
      from: `"Zenify" <${config.SMTP_USER}>`,
      to,
      subject: 'Your Zenify Account Has Been Permanently Deleted',
      html: content,
    });
  }
}
