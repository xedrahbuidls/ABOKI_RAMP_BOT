// services/kycService.js
const User = require('../db/models/user');

const completeKyc = async (userId) => {
  const updatedUser = await User.findOneAndUpdate(
    { userId },
    { kycStatus: true },
    { new: true }
  );
  
  return updatedUser;
};

const checkKycStatus = async (userId) => {
  const user = await User.findOne({ userId });
  return user ? user.kycStatus : false;
};

module.exports = {
  completeKyc,
  checkKycStatus
};