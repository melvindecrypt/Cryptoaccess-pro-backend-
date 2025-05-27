import nodemailer from 'nodemailer';
import hbs from 'nodemailer-express-handlebars';
import path from 'path';
import logger from '../utils/logger.js';

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Enable handlebars for dynamic templates
transporter.use(
  'compile',
  hbs({
    viewEngine: {
      extname: '.hbs',
      partialsDir: path.resolve('./templates/emails'),
      defaultLayout: false,
    },
    viewPath: path.resolve('./templates/emails'),
    extName: '.hbs',
  })
);

// Send .hbs templated email
const sendEmail = async ({ to, subject, template, data }) => {
  try {
    await transporter.sendMail({
      from: `"CryptoAccess Pro" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      template, // Matches the .hbs file name
      context: data,
    });
  } catch (error) {
    logger.error('Templated email error:', error.message);
    throw new Error('Failed to send templated email');
  }
};

// Send static HTML email (no .hbs)
const sendWelcomeEmail = async (email, walletId) => {
  try {
    await transporter.sendMail({
      from: `"CryptoAccess Pro" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Welcome to CryptoAccess Pro!',
      html: `
        <h2>Account Registration Successful</h2>
        <p>Your wallet ID: <strong>${walletId}</strong></p>
        <p>Start trading after admin approval and KYC verification.</p>
        <p>Need help? Contact support at: ${process.env.SUPPORT_EMAIL}</p>
      `,
    });
  } catch (error) {
    logger.error('Welcome email error:', error.message);
    throw new Error('Failed to send welcome email');
  }
};

// Send admin KYC notification (static HTML or convert to template later)
const sendKYCNotification = async ({ userEmail, userId, adminEmail }) => {
  try {
    await transporter.sendMail({
      from: `"KYC System" <${process.env.EMAIL_USER}>`,
      to: adminEmail,
      subject: 'New KYC Submission Requires Review',
      html: `
        <h2>New KYC Submission</h2>
        <p><strong>User:</strong> ${userEmail}</p>
        <p><strong>User ID:</strong> ${userId}</p>
        <p>Please review the documents in the admin panel.</p>
        <a href="${process.env.ADMIN_URL}/kyc-review/${userId}">
          Review KYC Submission
        </a>
      `,
    });
  } catch (error) {
    logger.error(`KYC notification email failed: ${error.message}`);
  }
};

export { sendEmail, sendWelcomeEmail, sendKYCNotification };