import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: 'eventbooking.otp@gmail.com',
        pass: 'dnxv vfgw emvi llgx',
    },
});

async function test() {
    try {
        console.log('Testing SMTP connection...');
        await transporter.verify();
        console.log('Success: SMTP connection is valid!');

        console.log('Sending test mail...');
        await transporter.sendMail({
            from: '"Zenify Test" <eventbooking.otp@gmail.com>',
            to: 'ramzendrum@gmail.com',
            subject: 'Zenify SMTP Test',
            text: 'If you see this, Zenify mail is working!',
        });
        console.log('Success: Test mail sent!');
    } catch (err) {
        console.error('SMTP Error:', err);
    }
}

test();
