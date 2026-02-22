import { MailService } from './src/services/mail.service';

async function testEmails() {
    const email = 'cookwithcomali5@gmail.com';
    const now = new Date();
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + 1);

    console.log('[Test] Sending OTP email...');
    await MailService.sendOTP(email, '489392');

    console.log('[Test] Sending Welcome email...');
    await MailService.sendWelcome(email, 'Guest Listener');

    console.log('[Test] Sending Purchase Confirmation email...');
    await MailService.sendPurchaseConfirmation(email, 'Zenify Premium — 1 Month', 99.00, 'Guest Listener', now, expiryDate);

    console.log('[Test] Sending Expiry Reminder email...');
    await MailService.sendSubscriptionExpiryReminder(email, 'Guest Listener', expiryDate);

    console.log('[Test] Sending Account Deletion email...');
    await MailService.sendAccountDeleted(email);

    console.log('All test emails dispatched!');
}

testEmails().catch(console.error);
