import nodemailer from 'nodemailer';
import { config } from '../config/env';

export class MailService {
    private static transporter = nodemailer.createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        secure: config.SMTP_PORT === 465, // true for 465, false for other ports
        auth: {
            user: config.SMTP_USER,
            pass: config.SMTP_PASS,
        },
    });

    static async sendOTP(to: string, otp: string) {
        const mailOptions = {
            from: `"Zenify Music" <${config.SMTP_USER}>`,
            to,
            subject: 'Your Zenify Verification Code',
            html: `
                <div style="background-color: #000000; padding: 40px 0; width: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                    <table align="center" border="0" cellpadding="0" cellspacing="0" width="480" style="background-color: #0a0a0a; border: 1px solid #1a1a1a; border-radius: 24px; overflow: hidden; box-shadow: 0 40px 100px rgba(0,0,0,0.8);">
                        <tr>
                            <td style="padding: 48px 40px; text-align: center;">
                                <!-- Logo -->
                                <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 32px;">
                                    <tr>
                                        <td style="background-color: #8b5cf6; width: 56px; height: 56px; border-radius: 16px; text-align: center; color: #ffffff; font-size: 28px; font-weight: 800; line-height: 56px;">
                                            Z
                                        </td>
                                    </tr>
                                </table>
                                
                                <h1 style="color: #ffffff; font-size: 24px; font-weight: 800; margin: 0 0 12px 0; letter-spacing: -0.04em;">Verify your identity</h1>
                                <p style="color: #888888; font-size: 15px; line-height: 1.6; margin: 0 0 40px 0;">Use the code below to secure your Zenify account. This code is valid for 10 minutes and should not be shared.</p>
                                
                                <!-- OTP Box -->
                                <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #111111; border: 1px solid #222222; border-radius: 20px; margin-bottom: 40px;">
                                    <tr>
                                        <td style="padding: 32px; text-align: center; color: #8b5cf6; font-family: 'Courier New', Courier, monospace; font-size: 42px; font-weight: 900; letter-spacing: 14px;">
                                            ${otp}
                                        </td>
                                    </tr>
                                </table>
                                
                                <p style="color: #444444; font-size: 12px; margin: 0 0 32px 0;">If you didn't request this code, you can ignore this email. Your password won't be changed without this verification.</p>
                                
                                <div style="border-top: 1px solid #1a1a1a; padding-top: 32px;">
                                    <p style="color: #666666; font-size: 10px; text-transform: uppercase; letter-spacing: 0.25em; font-weight: 800; margin: 0;">&copy; 2026 Zenify Music Group</p>
                                </div>
                            </td>
                        </tr>
                    </table>
                </div>
            `,
        };

        return await this.transporter.sendMail(mailOptions);
    }
}
