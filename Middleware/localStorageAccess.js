const path = require('path');
const fs = require('fs');
const { formatResponse } = require('../utils/helpers');

module.exports = (req, res, next) => {
  try {
    const relativePath = req.query.path;
    const baseDir = path.join(__dirname, '../uploads/kyc');

    // Prevent path traversal
    const fullPath = path.resolve(baseDir, relativePath);
    if (!fullPath.startsWith(baseDir)) {
      return res.status(400).json(formatResponse(false, 'Invalid file path'));
    }

// Add after path validation
const allowedTypes = ['.jpg', '.png', '.pdf'];
const fileExt = path.extname(fullPath).toLowerCase();
if (!allowedTypes.includes(fileExt)) {
  return res.status(400).json(formatResponse(false, 'Invalid file type'));
}

    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json(formatResponse(false, 'File not found'));
    }

    req.localFilePath = fullPath;
    next();
  } catch (error) {
    return res.status(500).json(formatResponse(false, 'File access failed'));
  }
};