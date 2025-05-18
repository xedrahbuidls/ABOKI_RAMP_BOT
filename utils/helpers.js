// utils/helpers.js
const generateTxId = () => {
  return "TX" + Math.random().toString(36).substring(2, 10).toUpperCase();
};

const isValidAccountNumber = (accountNumber) => {
  return /^\d{10}$/.test(accountNumber);
};

const getMockAccountName = () => {
  const mockNames = [
    "John Doe",
    "Jane Smith",
    "Michael Johnson",
    "Sarah Williams",
  ];
  return mockNames[Math.floor(Math.random() * mockNames.length)];
};

module.exports = {
  generateTxId,
  isValidAccountNumber,
  getMockAccountName
};