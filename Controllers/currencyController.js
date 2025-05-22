const currency = require('../models/currency');
const { formatResponse } = require('../utils/helpers'); // Adjust the path if necessary

exports.getAllCurrencies = async (req, res) => {
  try {
    const currencies = await Currency.find({ isActive: true })
      .select('symbol name logoUrl')
      .sort({ name: 1 }) // Optional: Sort currencies alphabetically by name
      .lean();
    res.json(formatResponse(true, 'Currencies retrieved successfully', currencies));
  } catch (error) {
    console.error('Error fetching currencies:', error);
    res.status(500).json(formatResponse(false, 'Server error while fetching currencies', { error: error.message }));
  }
};
