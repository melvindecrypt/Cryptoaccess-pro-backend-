import path from 'path';
import fs from 'fs';
import { formatResponse } from '../utils/helpers.js';
import User from '../models/user.js'; // You'll need this to get the user-specific directory

// Middleware for Local Storage Access
export default async (req, res, next) => {
  try {
    const requestedFilename = req.query.path; // e.g., "1678889900-selfie.jpg"

    // The user ID needs to be part of the URL for the middleware to determine the specific folder.
    // Currently, your route is `/kyc-preview` not `/kyc-preview/:userId`. This is critical.
    // Assuming you change the route to `/kyc-preview/:userId`
    const targetUserId = req.params.userId;

    if (!requestedFilename || !targetUserId) {
      return res.status(400).json(formatResponse(false, 'Missing file path or user ID.'));
    }

    // Fetch user to verify the filename actually belongs to them
    const user = await User.findById(targetUserId).select('kycDocuments');
    if (!user) {
      return res.status(404).json(formatResponse(false, 'User not found.'));
    }

    // Verify that the requestedFilename actually exists in the user's stored documents
    const documentExists = user.kycDocuments.some(
      (doc) =>
        doc.frontFileUrl === requestedFilename ||
        doc.backFileUrl === requestedFilename ||
        doc.selfieFileUrl === requestedFilename
    );

    if (!documentExists) {
      // This prevents an admin from requesting arbitrary filenames even within a user's directory
      return res.status(404).json(formatResponse(false, 'Document not found for this user.'));
    }

    // Correct base directory for where files are actually stored
    // Assuming middleware/ is at [PROJECT_ROOT]/middleware/
    const baseDir = path.join(__dirname, '../../secure-storage/kyc'); // Matches FileStorage.js
    const userSpecificDir = path.join(baseDir, targetUserId.toString()); // Add the user ID directory

    // The full path to the file
    const fullPath = path.join(userSpecificDir, requestedFilename);

    // Crucial security check: Ensure the resolved path is indeed within the intended user's directory
    // This 'startsWith' check is still important, though less likely to be bypassed
    // if userSpecificDir is correctly constructed from trusted data.
    if (!fullPath.startsWith(userSpecificDir)) {
      return res.status(400).json(formatResponse(false, 'Invalid file path resolved.'));
    }

    const allowedTypes = ['.jpg', '.png', '.pdf'];
    const fileExt = path.extname(fullPath).toLowerCase();
    if (!allowedTypes.includes(fileExt)) {
      return res.status(400).json(formatResponse(false, 'Invalid file type'));
    }

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json(formatResponse(false, 'File not found'));
    }

    req.localFilePath = fullPath;
    next();
  } catch (error) {
    // Log the error for debugging
    console.error('Error in localStorageAccess middleware:', error);
    return res.status(500).json(formatResponse(false, 'File access failed'));
  }
};