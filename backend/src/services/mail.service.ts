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

    private static getEmailTemplate(content: string) {
        return `
            <div style="background-color: #050505; padding: 40px 0; width: 100%; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #000000; border-radius: 32px; overflow: hidden; box-shadow: 0 50px 100px rgba(0,0,0,0.9); border: 1px solid #1c1c1e;">
                    <!-- Header with Original Logo -->
                    <tr>
                        <td style="padding: 60px 40px 40px 40px; text-align: center;">
                            <table align="center" border="0" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td>
                                        <div style="width: 64px; height: 64px; background: #000000; border-radius: 18px; position: relative; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); display: inline-block;">
                                            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 40px; height: 40px; border: 3px solid #34d399; border-radius: 50%; border-top-color: transparent; opacity: 0.8;"></div>
                                            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(45deg); width: 32px; height: 32px; border: 3px solid #3b82f6; border-radius: 50%; border-top-color: transparent; opacity: 0.8;"></div>
                                            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(90deg); width: 24px; height: 24px; border: 3px solid #8b5cf6; border-radius: 50%; border-top-color: transparent; opacity: 0.8;"></div>
                                        </div>
                                    </td>
                                </tr>
                            </table>
                            <h1 style="color: #ffffff; font-size: 20px; font-weight: 400; letter-spacing: 4px; margin: 24px 0 0 0; text-transform: uppercase; color: #a1a1a6;">Zenify</h1>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 0 60px 60px 60px; text-align: center;">
                            ${content}
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 40px; text-align: center; background-color: #0a0a0a; border-top: 1px solid #1c1c1e;">
                            <p style="color: #636366; font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 12px 0;">Zenify Music Group</p>
                            <p style="color: #48484a; font-size: 10px; margin: 0 0 24px 0;">Designed by Zendrum Team &bull; 2026</p>
                            <div style="height: 1px; width: 40px; background-color: #1c1c1e; margin: 0 auto 24px auto;"></div>
                            <p style="color: #3a3a3c; font-size: 9px; line-height: 1.5;">This email was sent to you as a member of Zenify. You are receiving this because you signed up for our services.</p>
                        </td>
                    </tr>
                </table>
            </div>
        `;
    }

    static async sendOTP(to: string, otp: string) {
        const content = `
            <h1 style="color: #ffffff; font-size: 32px; font-weight: 700; margin: 0 0 16px 0; letter-spacing: -0.02em;">Verify your identity</h1>
            <p style="color: #a1a1a6; font-size: 16px; line-height: 1.5; margin: 0 0 40px 0;">To keep your Zenify experience secure, please enter the following verification code.</p>
            
            <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 40px;">
                <tr>
                    <td style="background-color: #1c1c1e; border: 1px solid #2c2c2e; border-radius: 16px; padding: 24px 48px; color: #A855F7; font-family: 'SF Mono', 'Courier New', monospace; font-size: 48px; font-weight: 800; letter-spacing: 8px;">
                        ${otp}
                    </td>
                </tr>
            </table>
            
            <p style="color: #636366; font-size: 13px; margin: 0;">This code is valid for 10 minutes. If you didn't request this, please ignore this email.</p>
        `;

        return await this.transporter.sendMail({
            from: `"Zenify" <${config.SMTP_USER}>`,
            to,
            subject: 'Your Verification Code',
            html: this.getEmailTemplate(content),
        });
    }

    static async sendWelcome(to: string, name?: string) {
        const content = `
            <h1 style="color: #ffffff; font-size: 40px; font-weight: 800; margin: 0 0 16px 0; letter-spacing: -0.03em;">Welcome to the <br/><span style="color: #3b82f6;">Future of Sound.</span></h1>
            <p style="color: #a1a1a6; font-size: 17px; line-height: 1.6; margin: 0 0 40px 0;">Hello ${name || 'there'}, your journey into high-fidelity music starts now. Zenify brings you millions of songs, ad-free, with the precision of studio sound.</p>
            
            <a href="${config.FRONTEND_URL}" style="background: #ffffff; color: #000000; padding: 16px 48px; border-radius: 30px; text-decoration: none; font-weight: 700; font-size: 15px; display: inline-block; transition: all 0.2s;">Start Listening Now</a>
        `;

        return await this.transporter.sendMail({
            from: `"Zenify" <${config.SMTP_USER}>`,
            to,
            subject: 'Welcome to Zenify',
            html: this.getEmailTemplate(content),
        });
    }

    static async sendPurchaseConfirmation(to: string, itemName: string, amount: number, username: string, purchaseDate: Date, expiryDate?: Date) {
        const dateStr = purchaseDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
        const timeStr = purchaseDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        const expiryStr = expiryDate ? expiryDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/A';

        const content = `
            <h1 style="color: #ffffff; font-size: 32px; font-weight: 700; margin: 0 0 8px 0; letter-spacing: -0.02em;">Thanks, ${username}!</h1>
            <p style="color: #a1a1a6; font-size: 16px; line-height: 1.5; margin: 0 0 40px 0;">Your purchase is confirmed. Here's your receipt.</p>
            
            <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #1c1c1e; border-radius: 24px; text-align: left; margin-bottom: 24px; border: 1px solid #2c2c2e;">
                <tr>
                    <td style="padding: 32px;">
                        <table border="0" cellpadding="0" cellspacing="0" width="100%">
                            <tr>
                                <td style="color: #636366; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; font-weight: 700;">Order Details</td>
                                <td align="right" style="color: #636366; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; font-weight: 700;">${dateStr}</td>
                            </tr>
                            <tr><td height="24" colspan="2"></td></tr>
                            <tr>
                                <td style="color: #ffffff; font-size: 15px; font-weight: 600;">${itemName}</td>
                                <td align="right" style="color: #ffffff; font-size: 15px; font-weight: 600;">₹${amount.toFixed(2)}</td>
                            </tr>
                            <tr><td height="16" colspan="2" style="border-bottom: 1px solid #2c2c2e;"></td></tr>
                            <tr><td height="16" colspan="2"></td></tr>
                            <tr>
                                <td style="color: #a1a1a6; font-size: 13px;">Purchased At</td>
                                <td align="right" style="color: #a1a1a6; font-size: 13px;">${timeStr}</td>
                            </tr>
                            <tr><td height="8" colspan="2"></td></tr>
                            <tr>
                                <td style="color: #a1a1a6; font-size: 13px;">Plan Expiry</td>
                                <td align="right" style="color: #34d399; font-size: 13px; font-weight: 600;">${expiryStr}</td>
                            </tr>
                            <tr><td height="24" colspan="2"></td></tr>
                            <tr>
                                <td style="color: #ffffff; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Total Paid</td>
                                <td align="right" style="color: #3b82f6; font-size: 20px; font-weight: 800;">₹${amount.toFixed(2)}</td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
            
            <p style="color: #636366; font-size: 13px; line-height: 1.5;">Your subscription will auto-renew on ${expiryStr}. You can manage your subscription in your profile settings.</p>
        `;

        return await this.transporter.sendMail({
            from: `"Zenify" <${config.SMTP_USER}>`,
            to,
            subject: `Receipt for your Zenify Purchase`,
            html: this.getEmailTemplate(content),
        });
    }

    static async sendSubscriptionExpiryReminder(to: string, username: string, expiryDate: Date) {
        const expiryStr = expiryDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

        const content = `
            <h1 style="color: #ffffff; font-size: 32px; font-weight: 700; margin: 0 0 16px 0; letter-spacing: -0.02em;">Don't miss a beat.</h1>
            <p style="color: #a1a1a6; font-size: 16px; line-height: 1.5; margin: 0 0 40px 0;">Hello ${username}, your Zenify Premium subscription is set to expire tomorrow on <b>${expiryStr}</b>.</p>
            
            <div style="background-color: #1c1c1e; border: 1px solid #8b5cf6; border-radius: 20px; padding: 24px; margin-bottom: 40px;">
                <p style="color: #ffffff; font-size: 15px; font-weight: 600; margin: 0 0 8px 0;">Keep the music flowing.</p>
                <p style="color: #a1a1a6; font-size: 13px; line-height: 1.4; margin: 0;">Renew now to ensure uninterrupted access to high-fidelity audio, ad-free streaming, and your entire library.</p>
            </div>
            
            <a href="${config.FRONTEND_URL}/pricing" style="background: #8b5cf6; color: #ffffff; padding: 16px 48px; border-radius: 30px; text-decoration: none; font-weight: 700; font-size: 15px; display: inline-block;">Renew Subscription</a>
        `;

        return await this.transporter.sendMail({
            from: `"Zenify" <${config.SMTP_USER}>`,
            to,
            subject: 'Important: Your Zenify Premium is expiring tomorrow',
            html: this.getEmailTemplate(content),
        });
    }

    static async sendAccountDeleted(to: string) {
        const content = `
            <h1 style="color: #ffffff; font-size: 32px; font-weight: 700; margin: 0 0 16px 0; letter-spacing: -0.02em;">We're signing off.</h1>
            <p style="color: #a1a1a6; font-size: 16px; line-height: 1.6; margin: 0 0 40px 0;">Your Zenify account has been successfully deleted as per your request. We're sad to see you go, but thank you for using and listening with us.</p>
            
            <p style="color: #636366; font-size: 14px; line-height: 1.6;">If you decide to come back, the music will be waiting for you.</p>
        `;

        return await this.transporter.sendMail({
            from: `"Zenify" <${config.SMTP_USER}>`,
            to,
            subject: 'Account Signed Off',
            html: this.getEmailTemplate(content),
        });
    }
}
