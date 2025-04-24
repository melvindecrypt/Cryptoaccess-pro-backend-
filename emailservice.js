// utils/emailService.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'your-email@gmail.com',
    pass: 'your-app-password', // Use Gmail app password, not your real password
  },
});

const sendWelcomeEmail = async (email, walletId) => {
  const mailOptions = {
    from: 'Binance Pro <your-email@gmail.com>',
    to: email,
    subject: 'Welcome to Binance Pro!',
    html: `
      <h2>Welcome to Binance Pro</h2>
      <p>Thank you for registering with us.</p>
      <p>Your Wallet ID: <strong>${walletId}</strong></p>
      <p>If you have any questions, contact support: <a href="mailto:melvindecrypt@gmail.com">melvindecrypt@gmail.com</a></p>
    `
  };

  return transporter.sendMail(mailOptions);
};

module.exports = { sendWelcomeEmail };