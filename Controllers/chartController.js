// In controllers/chartController.js
const axios = require('axios'); // You might need to install this: npm install axios

exports.getChartData = async (req, res) => {
  try {
    const { coin } = req.query;

    if (!coin) {
      return res.status(400).json(formatResponse(false, 'Coin parameter is required'));
    }

    // Replace with your actual API endpoint and logic to fetch chart data
    const chartApiUrl = `YOUR_CHART_DATA_API_URL?symbol=${coin}&interval=1d`; // Example

    const response = await axios.get(chartApiUrl);
    const chartData = response.data;

    res.json(formatResponse(true, `Chart data for ${coin} retrieved successfully`, chartData));

  } catch (error) {
    console.error(`Error fetching chart data for ${coin}:`, error);
    res.status(500).json(formatResponse(false, `Server error fetching chart data for ${coin}`, { error: error.message }));
  }
};
