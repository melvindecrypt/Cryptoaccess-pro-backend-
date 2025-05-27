import axios from 'axios';

export const getChartData = async (req, res) => {
  try {
    const { coin } = req.query;

    if (!coin) {
      return res.status(400).json({ success: false, message: 'Coin parameter is required' });
    }

    const coinId = coin.toLowerCase(); // CoinGecko uses lowercase IDs

    const chartApiUrl = `https://api.coingecko.com/api/v3/coins/ ${coinId}/market_chart?vs_currency=usd&days=30`; // Example: last 30 days

    const response = await axios.get(chartApiUrl);
    const chartData = response.data.prices; // Adjust based on CoinGecko's response structure

    // Format the data
    const formattedData = chartData.map((item) => ({
      timestamp: new Date(item[0]).toISOString(), // Convert to ISO 8601
      price: item[1],
    }));

    res.json({ coin: coin.toUpperCase(), data: formattedData }); // Match API response structure directly
  } catch (error) {
    console.error(`Error fetching chart data for ${coin}:`, error);

    if (error.response && error.response.status === 404) {
      return res.status(404).json({ success: false, message: `Chart data not found for ${coin}` });
    }

    res.status(500).json({ success: false, message: 'Server error fetching chart data', error: error.message });
  }
};