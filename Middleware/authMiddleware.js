const jwt = require('jsonwebtoken');

const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) throw new Error('Authentication required');

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.userId)
      .select('-password -__v')
      .lean();

    if (!req.user) throw new Error('User not found');
    next();
  } catch (error) {
    res.status(401).json({ 
      error: 'Unauthorized',
      message: error.message
    });
  }
};

const isAdmin = (req, res, next) => {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ 
      error: 'Forbidden',
      message: 'Admin privileges required'
    });
  }
  next();
};

module.exports = { authenticate, isAdmin };
