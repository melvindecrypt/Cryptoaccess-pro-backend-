const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const {Resend} = require('resend'); // Import Resend for email

// Load environment variables
dotenv.config();

// Import routes
const adminRoutes = require('./routes/admin');
const User = require('./models/User');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// Ensure you are using MONGODB_URI, not MONGO_URI
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,       // Use the new URL parser
  useUnifiedTopology: true     // Use the new connection management engine
})
  .then(() => {
    console.log('Connected to MongoDB');
  })
  .catch((err) => {
    console.error('Error connecting to MongoDB:', err);
  });

const { sendWelcomeEmail } = require('./controllers/authController'); // Import the function

const userEmail = 'user@example.com'; // Replace with dynamic email (e.g., from user registration)

const sendEmail = async () => {
  try {
    await sendWelcomeEmail(userEmail);
    console.log('Welcome email sent to', userEmail);
  } catch (error) {
    console.error('Error sending welcome email:', error);
  }
};

sendEmail();

// Signup route
app.post('/api/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = new User({ email, password });
    await user.save();
    res.json({ message: 'Signup successful. Awaiting admin approval.' });

    // Send email after signup (optional)
    await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'Signup Successful',
      html: '<p>Thank you for signing up! Your account is pending approval from the admin.</p>',
    });

  } catch (err) {
    res.status(500).json({ error: 'Signup failed' });
  }
});

// Login route
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (!user || !user.approved) {
    return res.status(401).json({ error: 'Not approved or user not found' });
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: 'Invalid credentials' });

  // Generate JWT token
  const token = jwt.sign({ id: user._id, role: 'user' }, process.env.JWT_SECRET);
  res.json({ token, userData: { id: user._id, email: user.email } });
});

// Admin routes (must be defined in the './routes/admin' file)
app.use('/admin', adminRoutes);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

const authRoutes = require('./routes/authRoute');
const paymentRoute = require('./routes/paymentRoute');

app.use('/api/auth', authRoutes);
app.use('/api', paymentRoute); // For /payment-method

// Import routes
const walletRoutes = require('./routes/wallet');
const investmentRoutes = require('./routes/investments');

// Use routes
app.use('/api/wallet', walletRoutes); // Route for wallet actions
app.use('/api/investments', investmentRoutes); // Route for investments actions

// Other routes & middlewares like auth, support, etc.

module.exports = app;

// const { resend } = require('resend'); // Commented import

// Signup route
app.post('/api/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = new User({ email, password });
    await user.save();
    res.json({ message: 'Signup successful. Awaiting admin approval.' });

    // Commented out Resend email functionality
    // await resend.emails.send({
    //   from: process.env.EMAIL_FROM,
    //   to: email,
    //   subject: 'Signup Successful',
    //   html: '<p>Thank you for signing up! Your account is pending approval from the admin.</p>',
    // });

  } catch (err) {
    res.status(500).json({ error: 'Signup failed' });
  }
});