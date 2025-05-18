// db/models/user.js
const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['buy', 'sell'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    required: true
  },
  received: {
    type: Number
  },
  receivedCurrency: {
    type: String
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  txHash: {
    type: String
  }
});

const userSchema = new mongoose.Schema({
  userId: {
    type: Number,
    required: true,
    unique: true
  },
  username: {
    type: String
  },
  wallet: {
    type: String
  },
  walletAuthenticated: {
    type: Boolean,
    default: false
  },
  authTimestamp: {
    type: Date
  },
  transactions: [transactionSchema]
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);