// services/walletService.js
const crypto = require('crypto');
const User = require('../db/models/user');

const generateWallet = async (userId) => {
  const walletAddress = "0x" + crypto.randomBytes(20).toString("hex");
  
  // Update or create user with the new wallet
  await User.findOneAndUpdate(
    { userId },
    { wallet: walletAddress },
    { upsert: true, new: true }
  );

  return walletAddress;
};

const getMockBalances = () => {
  return {
    BTC: (Math.random() * 0.1).toFixed(8),
    ETH: (Math.random() * 1.5).toFixed(6),
    USDC: (Math.random() * 100).toFixed(2),
    USDT: (Math.random() * 100).toFixed(2),
    XRP: (Math.random() * 50).toFixed(2),
  };
};

const getTokenBalance = (token) => {
  // Mock balance for demo
  return Math.random() * 20;
};

module.exports = {
  generateWallet,
  getMockBalances,
  getTokenBalance
};
