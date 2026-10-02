import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'sandbox.smtp.mailtrap.io',
  port: parseInt(process.env.SMTP_PORT || '2525'),
  secure: false, // Mailtrap uses STARTTLS, not SSL
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false, // Allow self-signed certs in dev
  },
});

export const sendEmail = async (to: string, subject: string, text: string, html?: string) => {
  try {
    const info = await transporter.sendMail({
      from: process.env.FROM_EMAIL || '"AVATAR App" <no-reply@avatar.com>',
      to,
      subject,
      text,
      html,
    });
    console.log(`[Email] Message sent: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error(`[Email] Error sending email to ${to}:`, error);
    throw error; // Rethrow to let the caller handle it
  }
};
