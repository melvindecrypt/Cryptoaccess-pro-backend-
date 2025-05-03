const jwt = require('jsonwebtoken');

const verifyAdmin = (req, res, next) => {
  const token = req.cookies.adminToken || req.headers.authorization?.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err || decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.admin = decoded;
    next();
  });
};

module.exports = verifyAdmin;

// routes/auth.js
router.post('/login', 
  auditLog('login', { 
    metadataFields: ['email'],
    status: req => req.authSuccessful ? 'success' : 'failed'
  }),
  authController.login
);

router.post('/logout', 
  requireAuth,
  auditLog('logout'),
  authController.logout
);