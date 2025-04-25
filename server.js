const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Load environment variables
dotenv.config();

// Import routes and models
const adminRoutes = require('./routes/admin');
const User = require('./models/User');
const { sendWelcomeEmail } = require('./utils/emailService');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// Database connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Auth Routes
app.post('/api/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = new User({ email, password });
    await user.save();
    
    // Send welcome email
    await sendWelcomeEmail(email, user.walletId);
    
    res.json({ 
      success: true,
      message: 'Signup successful. Awaiting admin approval.'
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      error: 'Signup failed',
      message: err.message
    });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user || !user.isApproved) {
      return res.status(401).json({ 
        success: false,
        error: 'Unauthorized',
        message: 'Account not approved or user not found'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // JWT Token generation
    const token = jwt.sign(
      { id: user._id, email: user.email, role: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        walletId: user.walletId
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Login failed',
      message: err.message
    });
  }
});

// Routes
app.use('/admin', adminRoutes);
const authRoutes = require('./routes/authRoute');
const paymentRoute = require('./routes/paymentRoute');
const walletRoutes = require('./routes/wallets');
const walletTransferRoutes = require('./routes/walletTransfer');
const investmentRoutes = require('./routes/investments');

app.use('/api/auth', authRoutes);
app.use('/api', paymentRoute);
app.use('/api/wallet', walletRoutes);
app.use('/api/wallets/transfer', walletTransferRoutes); // or /wallet-transfers
app.use('/api/investments', investmentRoutes);

// Server setup
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;