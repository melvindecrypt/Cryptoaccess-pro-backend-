// In controllers/chartController.js
const axios = require('axios');

exports.getChartData = async (req, res) => {
  try {
    const { coin } = req.query;

    if (!coin) {
      return res.status(400).json(formatResponse(false, 'Coin parameter is required'));
    }

    const coinId = coin.toLowerCase(); // CoinGecko uses lowercase IDs

    const chartApiUrl = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=30`; // Example: last 30 days

    const response = await axios.get(chartApiUrl);
    const chartData = response.data.prices; // Adjust based on CoinGecko's response structure

    // Format the data if needed (e.g., convert timestamps)
    const formattedData = chartData.map(item => ({
      timestamp: item[0],
      price: item[1],
    }));

    res.json(formatResponse(true, `Chart data for ${coin} retrieved successfully`, formattedData));

  } catch (error) {
    console.error(`Error fetching chart data for ${coin}:`, error);
    let errorMessage = 'Server error fetching chart data';
    if (error.response && error.response.status === 404) {
      errorMessage = `Chart data not found for ${coin}`;
      return res.status(404).json(formatResponse(false, errorMessage));
    }
    res.status(500).json(formatResponse(false, errorMessage, { error: error.message }));
  }
};
