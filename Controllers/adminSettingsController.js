import { adminSpreadSettings, updateAdminSpreadSettings, AVAILABLE_TRADING_PAIRS } from '../utils/exchangeUtils'; // Adjust path
import { formatResponse } from '../utils/helpers'; // Assuming your helper file contains formatResponse
import { logger } from '../utils/logger'; // Assuming your logger utility

// Assuming req.user is populated by your authentication middleware
// and req.user.role is checked by adminAuth middleware.

export const getSpreadSettings = async (req, res) => {
  try {
    // Send both current settings and the list of available pairs for the frontend table
    return res.json(formatResponse(true, 'Spread settings retrieved successfully', {
      settings: adminSpreadSettings,
      availablePairs: AVAILABLE_TRADING_PAIRS.map(p => p.symbol)
    }));
  } catch (error) {
    logger.error(`Error fetching spread settings: ${error.message}`, error);
    res.status(500).json(formatResponse(false, 'Server error while fetching spread settings'));
  }
};

export const updateSpreadSettings = async (req, res) => {
  try {
    const { pair, minSpreadPct, maxSpreadPct, isDefault } = req.body;

    // Basic validation
    if (typeof minSpreadPct !== 'number' || typeof maxSpreadPct !== 'number' || minSpreadPct < 0 || maxSpreadPct < minSpreadPct) {
      return res.status(400).json(formatResponse(false, 'Invalid spread percentage values. Must be positive and min <= max.'));
    }

    if (isDefault) {
      updateAdminSpreadSettings({ isDefault: true, minSpreadPct, maxSpreadPct });
      return res.json(formatResponse(true, 'Default spread settings updated successfully.', { defaultSettings: adminSpreadSettings['DEFAULT'] }));
    } else if (pair) {
      const pairUpper = pair.toUpperCase();
      // The updateAdminSpreadSettings function already has a check for AVAILABLE_TRADING_PAIRS
      updateAdminSpreadSettings({ pair: pairUpper, minSpreadPct, maxSpreadPct });
      return res.json(formatResponse(true, `Spread settings for ${pairUpper} updated successfully.`, { pairSettings: adminSpreadSettings[pairUpper] }));
    } else {
      return res.status(400).json(formatResponse(false, 'Missing pair or default flag for spread update.'));
    }
  } catch (error) {
    logger.error(`Error updating spread settings: ${error.message}`, error);
    res.status(400).json(formatResponse(false, error.message || 'An unexpected error occurred during spread update.'));
  }
};
