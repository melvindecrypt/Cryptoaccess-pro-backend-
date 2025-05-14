require('dotenv').config();
const mongoose = require('mongoose');
const Currency = require('./models/Currency'); // Adjust path if needed

async function populateDatabase() {
  try {
    const mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
      console.error('MONGODB_URI environment variable not set.');
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('Connected to the database');

    const yourCurrencyList = [
      { symbol: 'BTC', name: 'Bitcoin' },
      { symbol: 'ETH', name: 'Ethereum' },
      { symbol: 'USDT', name: 'Tether' },
      { symbol: 'BNB', name: 'Binance Coin' },
      { symbol: 'SOL', name: 'Solana' },
      { symbol: 'USDC', name: 'USD Coin' },
      { symbol: 'XRP', name: 'XRP' },
      { symbol: 'TON', name: 'Toncoin' },
      { symbol: 'ADA', name: 'Cardano' },
      { symbol: 'DOGE', name: 'Dogecoin' },
      { symbol: 'AVAX', name: 'Avalanche' },
      { symbol: 'SHIB', name: 'Shiba Inu' },
      { symbol: 'DOT', name: 'Polkadot' },
      { symbol: 'TRX', name: 'TRON' },
      { symbol: 'LINK', name: 'Chainlink' },
      { symbol: 'MATIC', name: 'Polygon' },
      { symbol: 'LTC', name: 'Litecoin' },
      { symbol: 'BCH', name: 'Bitcoin Cash' },
      { symbol: 'NEAR', name: 'NEAR Protocol' },
      { symbol: 'UNI', name: 'Uniswap' },
      { symbol: 'ICP', name: 'Internet Computer' },
      { symbol: 'APT', name: 'Aptos' },
      { symbol: 'XLM', name: 'Stellar' },
      { symbol: 'LDO', name: 'Lido DAO' },
      { symbol: 'ARB', name: 'Arbitrum' },
      { symbol: 'OP', name: 'Optimism' },
      { symbol: 'XMR', name: 'Monero' },
      { symbol: 'RNDR', name: 'Render' },
      { symbol: 'HBAR', name: 'Hedera' },
      { symbol: 'VET', name: 'VeChain' },
      { symbol: 'IMX', name: 'Immutable' },
      { symbol: 'MKR', name: 'Maker' },
      { symbol: 'INJ', name: 'Injective' },
      { symbol: 'GRT', name: 'The Graph' },
      { symbol: 'AAVE', name: 'Aave' },
      { symbol: 'SUI', name: 'Sui' },
      { symbol: 'ALGO', name: 'Algorand' },
      { symbol: 'KAS', name: 'Kaspa' },
      { symbol: 'STX', name: 'Stacks' },
      { symbol: 'QNT', name: 'Quant' },
      { symbol: 'FTM', name: 'Fantom' },
      { symbol: 'THETA', name: 'Theta Network' },
      { symbol: 'FLOW', name: 'Flow' },
      { symbol: 'XTZ', name: 'Tezos' },
      { symbol: 'BSV', name: 'Bitcoin SV' },
      { symbol: 'TIA', name: 'Celestia' },
      { symbol: 'CRV', name: 'Curve DAO' },
      { symbol: 'AXS', name: 'Axie Infinity' },
      { symbol: 'APE', name: 'ApeCoin' },
      { symbol: 'EOS', name: 'EOS' },
      { symbol: 'MANA', name: 'Decentraland' },
      { symbol: 'RPL', name: 'Rocket Pool' },
      { symbol: 'CAKE', name: 'PancakeSwap' },
      { symbol: 'GALA', name: 'Gala' },
      { symbol: 'DYDX', name: 'dYdX' },
      { symbol: 'MINA', name: 'Mina Protocol' },
      { symbol: 'HNT', name: 'Helium' },
      { symbol: 'KAVA', name: 'Kava' },
      { symbol: 'WLD', name: 'Worldcoin' },
      { symbol: 'IOTA', name: 'IOTA' },
      { symbol: 'ROSE', name: 'Oasis Network' },
      { symbol: 'ZEC', name: 'Zcash' },
      { symbol: 'OCEAN', name: 'Ocean Protocol' },
      { symbol: 'BLUR', name: 'Blur' },
      { symbol: 'NEO', name: 'NEO' },
      { symbol: 'ENJ', name: 'Enjin Coin' },
      { symbol: 'XRD', name: 'Radix' },
      { symbol: 'CKB', name: 'Nervos Network' },
      { symbol: 'GMX', name: 'GMX' },
      { symbol: '1INCH', name: '1inch' },
      { symbol: 'BAND', name: 'Band Protocol' },
      { symbol: 'WOO', name: 'WOO Network' },
      { symbol: 'ARKM', name: 'Arkham' },
      { symbol: 'ONT', name: 'Ontology' },
      { symbol: 'CVP', name: 'PowerPool' },
      { symbol: 'METIS', name: 'MetisDAO' },
      { symbol: 'SPELL', name: 'Spell Token' },
      { symbol: 'RSR', name: 'Reserve Rights' },
      { symbol: 'TWT', name: 'Trust Wallet Token' },
      { symbol: 'XDC', name: 'XDC Network' },
      { symbol: 'ERG', name: 'Ergo' },
      { symbol: 'TRAC', name: 'OriginTrail' },
      { symbol: 'SUPER', name: 'SuperVerse' },
      { symbol: 'GLMR', name: 'Moonbeam' },
      { symbol: 'CELO', name: 'Celo' },
      { symbol: 'FIDA', name: 'Bonfida' },
      { symbol: 'COTI', name: 'COTI' },
      { symbol: 'XVS', name: 'Venus' },
      { symbol: 'EFI', name: 'Efinity Token' },
      { symbol: 'BTT', name: 'BitTorrent' },
      { symbol: 'ALPHA', name: 'Alpha Venture DAO' },
      { symbol: 'BADGER', name: 'Badger DAO' },
      { symbol: 'STRAX', name: 'Stratis' },
      { symbol: 'XPRT', name: 'Persistence' },
      { symbol: 'ALCX', name: 'Alchemix' },
      { symbol: 'SNX', name: 'Synthetix' },
      { symbol: 'NYM', name: 'Nym' },
      { symbol: 'VIC', name: 'Viction' },
      { symbol: 'ASTR', name: 'Astar Network' },
      { symbol: 'PUNDIX', name: 'Pundi X' },
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
