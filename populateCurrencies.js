const mongoose = require('mongoose');
const Currency = require('./models/Currency'); // Adjust path if needed

async function populateDatabase() {
  try {
    // Replace 'YOUR_MONGODB_CONNECTION_STRING' with your actual connection string
    await mongoose.connect('YOUR_MONGODB_CONNECTION_STRING');
    console.log('Connected to the database');

    const yourCurrencyList = [
      { symbol: 'BTC', name: 'Bitcoin' },
      { symbol: 'ETH', name: 'Ethereum' },
      // ... the rest of your currency data
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
