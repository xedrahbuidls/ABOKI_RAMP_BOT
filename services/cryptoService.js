// services/cryptoService.js
const { SUPPORTED_CRYPTO, SUPPORTED_FIAT } = require('../config/constant.js');

// Exchange rate service
const getExchangeRate = (from, to) => {
  const rates = {
    "BTC/USD": 65000,
    "ETH/USD": 3500,
    "USDC/USD": 1,
    "USDT/USD": 1,
    "XRP/USD": 0.6,
    "USD/NGN": 1500,
    "USD/GBP": 0.79,
    "USD/KSH": 131,
    "USD/GCD": 13.5,
  };

  if (from === to) return 1;

  // Direct rate
  if (rates[`${from}/${to}`]) return rates[`${from}/${to}`];

  // Inverse rate
  if (rates[`${to}/${from}`]) return 1 / rates[`${to}/${from}`];

  // Convert via USD
  if (SUPPORTED_CRYPTO.includes(from) && SUPPORTED_FIAT.includes(to)) {
    return rates[`${from}/USD`] * rates[`USD/${to}`];
  }

  if (SUPPORTED_FIAT.includes(from) && SUPPORTED_CRYPTO.includes(to)) {
    return (1 / rates[`USD/${from}`]) * rates[`${to}/USD`];
  }

  return 0;
};

module.exports = {
  getExchangeRate
};