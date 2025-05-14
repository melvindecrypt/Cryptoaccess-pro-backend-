const mongoose = require('mongoose');
const Currency = require('./models/Currency'); // Adjust path if needed
const config = require('./config/database'); // Assuming you have a database config file

async function populateDatabase() {
  try {
    await mongoose.connect(config.uri, config.options);
    console.log('Connected to the database');

    const yourCurrencyList = [
      { symbol: 'BTC', name: 'Bitcoin' },
      { symbol: 'ETH', name: 'Ethereum' },
      { symbol: 'USDT', name: 'Tether' },
      { symbol: 'BNB', name: 'Binance Coin' },
      // ... Add the rest of your 100 currencies here in this format
      { symbol: 'XYZ', name: 'Some Other Coin' },
    ];

    // Insert the currencies into the database
    const result = await Currency.insertMany(yourCurrencyList);
    console.log(`${result.length} currencies inserted successfully`);

    mongoose.disconnect();
    console.log('Disconnected from the database');
  } catch (error) {
    console.error('Error populating database:', error);
    mongoose.disconnect();
  }
}

populateDatabase();
