// ================== Admin Login ==================

    // Validate input format
    if (!email || !password || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json(formatResponse(false, 'Valid email and password required'));
    }

    // Find admin user with password
    const user = await User.findOne({ email })
      .select('+password +isAdmin +isSuspended')
      .lean();

    // Security checks
    if (!user?.isAdmin) {
      logger.warn('Admin login attempt failed: Invalid credentials', { email });
      return res.status(403).json(formatResponse(false, 'Access denied'));
    }

    if (user.isSuspended) {
      logger.warn('Suspended admin login attempt', { userId: user._id });
      return res.status(403).json(formatResponse(false, 'Account suspended'));
    }

    // Password verification
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      logger.warn('Admin login failed: Password mismatch', { email });
      return res.status(401).json(formatResponse(false, 'Invalid credentials'));
    }

    // JWT Token generation
    const token = jwt.sign({
      userId: user._id,
      email: user.email,
      isAdmin: true,
      permissions: ['admin'],
      authFreshness: Date.now()
    }, process.env.JWT_SECRET, { expiresIn: '15m' });

    // Secure cookie settings
    res.cookie('adminToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 900000 // 15 minutes
    });

    logger.info('Admin login successful', { userId: user._id });

    // Response without sensitive data
    res.json(formatResponse(true, 'Authentication successful', {
      user: {
        id: user._id,
        email: user.email,
        lastLogin: user.lastLogin
      }
    }));

  } catch (err) {
    logger.error('Admin login error', { error: err.stack });
    res.status(500).json(formatResponse(false, 'Internal server error'));
  }
});