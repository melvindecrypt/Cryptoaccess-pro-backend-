const nodemailer = require('nodemailer');
const hbs = require('nodemailer-express-handlebars');
const path = require('path');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Configure handlebars template engine
transporter.use('compile', hbs({
  viewEngine: {
    extname: '.hbs',
    partialsDir: path.resolve('./templates/emails'),
    defaultLayout: false
  },
  viewPath: path.resolve('./templates/emails'),
  extName: '.hbs'
}));

// Send dynamic template email
const sendEmail = async ({ to, subject, template, data }) => {
  try {
    await transporter.sendMail({
      from: `"CryptoAccess Pro" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      template, // e.g. 'kycApproved'
      context: data // e.g. { name: 'Alice' }
    });
  } catch (error) {
    console.error('Email sending error:', error);
    throw new Error('Failed to send email');
  }
};

// Send static HTML email (like your welcome email)
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

module.exports = {
  sendEmail,
  sendWelcomeEmail
};