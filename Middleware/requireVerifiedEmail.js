import { formatResponse } from '../utils/helpers.js';

export default (req, res, next) => {
  if (!req.user?.isVerified) {
    return res.status(403).json(
      formatResponse(false, 'Email verification required', {
        code: 'EMAIL_NOT_VERIFIED',
        solution: 'Check your email for the verification link or request a new one',
      })
    );
  }
  next();
};