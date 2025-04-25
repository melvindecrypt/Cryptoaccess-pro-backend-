const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

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
        <p>Contact support: ${process.env.SUPPORT_EMAIL}</p>
      `
    });
  } catch (error) {
    console.error('Email sending error:', error);
    throw new Error('Failed to send welcome email');
  }
};

module.exports = { sendWelcomeEmail };