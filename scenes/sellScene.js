// scenes/sellScene.js
const { Markup } = require("telegraf");
const { BaseScene } = require("telegraf/scenes");
const User = require("../db/models/user");
const { SUPPORTED_CRYPTO, SUPPORTED_FIAT, BANKS } = require("../config/constant.js");
const { getExchangeRate } = require("../services/cryptoService");
const { getTokenBalance } = require("../services/walletService");
const { generateTxId, isValidAccountNumber } = require("../utils/helpers");
const axios = require('axios');

const sellScene = new BaseScene("sell");

sellScene.enter(async (ctx) => {
  const user = await User.findOne({ userId: ctx.from.id });
  
  if (!user || !user.wallet) {
    // Generate wallet if user doesn't have one
    const generatedWallet = generateRandomWalletAddress();
    
    // Authenticate with API to get token
    try {
      const authResponse = await authenticateWallet(generatedWallet);
      const authToken = authResponse.data.data.token;
      
      await User.findOneAndUpdate(
        { userId: ctx.from.id },
        { 
          userId: ctx.from.id, 
          username: ctx.from.username, 
          wallet: generatedWallet,
          authToken: authToken
        },
        { upsert: true, new: true }
      );
      
      ctx.reply(
        `A wallet has been generated and authenticated!\n\nAddress: \`${generatedWallet}\``,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      console.error("Authentication error:", error);
      
      // Still create user but without token
      await User.findOneAndUpdate(
        { userId: ctx.from.id },
        { 
          userId: ctx.from.id, 
          username: ctx.from.username, 
          wallet: generatedWallet
        },
        { upsert: true, new: true }
      );
      
      ctx.reply(
        `A wallet has been generated for you!\n\nAddress: \`${generatedWallet}\``,
        { parse_mode: 'Markdown' }
      );
    }
  } else if (!user.authToken) {
    // User has wallet but no token, try to authenticate
    try {
      const authResponse = await authenticateWallet(user.wallet);
      const authToken = authResponse.data.data.token;
      
      await User.findOneAndUpdate(
        { userId: ctx.from.id },
        { authToken: authToken }
      );
    } catch (error) {
      console.error("Authentication error for existing wallet:", error);
      // Continue without token
    }
  }

  ctx.scene.session.awaitingAccountNumber = false;
  ctx.scene.session.awaitingAccountName = false;
  
  ctx.replyWithMarkdown(
    "*Enter token amount and symbol*\n\nExample: `10 USDC`"
  );
});

// COMBINED TEXT HANDLER FOR SELL SCENE
sellScene.on("text", async (ctx) => {
  // Check if we're waiting for account name
  if (ctx.scene.session.awaitingAccountName) {
    const accountName = ctx.message.text.trim();
    
    if (accountName.length < 2) {
      return ctx.replyWithMarkdown("⚠️ Please enter a valid account name");
    }
    
    ctx.scene.session.accountName = accountName;
    ctx.scene.session.awaitingAccountName = false;
    
    // Attempt to verify bank details with API
    const user = await User.findOne({ userId: ctx.from.id });
    if (user && user.authToken) {
      try {
        await verifyBankAccount({
          accountNumber: ctx.scene.session.accountNumber,
          bankName: ctx.scene.session.bank,
          accountName: accountName,
          isDefault: false
        }, user.authToken);
        
        // Show confirmation message
        await ctx.replyWithMarkdown(
          `
*Account Verified Successfully* ✅

Bank: ${ctx.scene.session.bank}
Account Number: ${ctx.scene.session.accountNumber}
Account Name: ${accountName}

Proceeding with transaction...
          `
        );
        
        // Process the transaction
        await processTransaction(ctx);
      } catch (error) {
        console.error("Bank verification error:", error);
        
        // Show error message but allow to proceed
        await ctx.replyWithMarkdown(
          `
*Bank Account Verification*

We couldn't verify your bank account details with our banking partners. 
You can either:
          `,
          Markup.inlineKeyboard([
            [Markup.button.callback("🔄 Re-enter Details", "RE_ENTER_ACCOUNT")],
            [Markup.button.callback("➡️ Continue Anyway", "CONTINUE_UNVERIFIED")]
          ])
        );
      }
    } else {
      // No auth token, continue without verification
      await ctx.replyWithMarkdown(
        `
*Bank Account Details*

Bank: ${ctx.scene.session.bank}
Account Number: ${ctx.scene.session.accountNumber}
Account Name: ${accountName}

Proceeding with transaction...
        `
      );
      
      // Process the transaction
      await processTransaction(ctx);
    }
    
    return;
  }
  
  // Check if we're waiting for an account number
  if (ctx.scene.session.awaitingAccountNumber) {
    const accountNumber = ctx.message.text.trim();

    // Basic validation
    if (!isValidAccountNumber(accountNumber)) {
      return ctx.replyWithMarkdown(
        "⚠️ Please enter a valid 10-digit account number"
      );
    }

    ctx.scene.session.accountNumber = accountNumber;
    ctx.scene.session.awaitingAccountNumber = false;
    
    // Now ask for account name
    await ctx.replyWithMarkdown("Please enter the account name:");
    ctx.scene.session.awaitingAccountName = true;
    return;
  }

  // Handle initial crypto input for selling
  const input = ctx.message.text.trim().split(" ");

  if (input.length !== 2) {
    return ctx.replyWithMarkdown(
      "⚠️ *Invalid format*\n\nPlease use format: `AMOUNT SYMBOL`\nExample: `10 USDC`"
    );
  }

  const amount = parseFloat(input[0]);
  const token = input[1].toUpperCase();

  if (isNaN(amount) || amount <= 0) {
    return ctx.replyWithMarkdown(
      "⚠️ *Invalid amount*\n\nPlease enter a valid number greater than 0"
    );
  }

  if (!SUPPORTED_CRYPTO.includes(token)) {
    return ctx.replyWithMarkdown(
      `⚠️ *Unsupported token*\n\nWe support: ${SUPPORTED_CRYPTO.join(", ")}`
    );
  }

  // Store in session
  ctx.scene.session.sellAmount = amount;
  ctx.scene.session.sellToken = token;

  // Check balance
  const tokenBalance = getTokenBalance(token);
  ctx.scene.session.tokenBalance = tokenBalance;

  if (tokenBalance < amount) {
    await ctx.replyWithMarkdown(
      `
⚠️ *Insufficient Balance*

Current balance: ${tokenBalance.toFixed(4)} ${token}
Requested amount: ${amount} ${token}

Please fund your wallet first.
    `,
      Markup.inlineKeyboard([
        [Markup.button.callback("🏠 Back to Main Menu", "MAIN_MENU")],
      ])
    );
    return ctx.scene.leave();
  }

  await ctx.replyWithMarkdown(
    "*Select currency to receive:*",
    Markup.inlineKeyboard(
      SUPPORTED_FIAT.map((fiat) => [
        Markup.button.callback(fiat, `RECEIVE_FIAT_${fiat}`),
      ])
    )
  );
});

sellScene.action(/RECEIVE_FIAT_(.+)/, async (ctx) => {
  const fiatCurrency = ctx.match[1];
  const { sellAmount, sellToken } = ctx.scene.session;

  // Calculate rate
  const rate = getExchangeRate(sellToken, fiatCurrency);
  const fiatAmount = sellAmount * rate;

  ctx.scene.session.fiatCurrency = fiatCurrency;
  ctx.scene.session.fiatAmount = fiatAmount.toFixed(2);

  await ctx.replyWithMarkdown(
    `
*Confirm Exchange Rate:*

${sellAmount} ${sellToken} = ${fiatAmount.toFixed(2)} ${fiatCurrency}

Rate: 1 ${sellToken} = ${rate.toFixed(2)} ${fiatCurrency}
  `,
    Markup.inlineKeyboard([
      [
        Markup.button.callback("✅ Confirm", "CONFIRM_SELL_RATE"),
        Markup.button.callback("❌ Cancel", "CANCEL_TRANSACTION"),
      ],
    ])
  );
});

sellScene.action("CONFIRM_SELL_RATE", async (ctx) => {
  // Proceed to bank selection
  await ctx.replyWithMarkdown(
    `
*Bank Account Setup* 🏦

Please select your bank:
    `,
    Markup.inlineKeyboard(
      BANKS.map((bank) => [
        Markup.button.callback(bank, `SELECT_BANK_${bank}`),
      ])
    )
  );
});

sellScene.action(/SELECT_BANK_(.+)/, async (ctx) => {
  const bank = ctx.match[1];
  ctx.scene.session.bank = bank;

  await ctx.replyWithMarkdown("Please enter your account number:");
  ctx.scene.session.awaitingAccountNumber = true;
});

sellScene.action("RE_ENTER_ACCOUNT", async (ctx) => {
  await ctx.replyWithMarkdown("Please select your bank:");
  return ctx.action(`CONFIRM_SELL_RATE`);
});

// Continue with unverified account
sellScene.action("CONTINUE_UNVERIFIED", async (ctx) => {
  await processTransaction(ctx);
});

// Process the transaction with the entered bank details
async function processTransaction(ctx) {
  const {
    sellAmount,
    sellToken,
    fiatAmount,
    fiatCurrency,
    bank,
    accountNumber,
    accountName,
  } = ctx.scene.session;

  await ctx.replyWithMarkdown(
    `
*Processing Transaction* ⏳

Amount: ${sellAmount} ${sellToken} → ${fiatAmount} ${fiatCurrency}
Bank: ${bank}
Account: ${accountNumber} (${accountName})

Please wait...
    `
  );

  // Process the transaction
  const txId = generateTxId();
  
  await User.findOneAndUpdate(
    { userId: ctx.from.id },
    { 
      $push: { 
        transactions: {
          type: "sell",
          amount: sellAmount,
          currency: sellToken,
          received: fiatAmount,
          receivedCurrency: fiatCurrency,
          bank,
          accountNumber,
          accountName,
          txId,
          timestamp: new Date()
        }
      }
    }
  );

  // Simulate delay for processing
  await new Promise(resolve => setTimeout(resolve, 2000));

  await ctx.replyWithMarkdown(
    `
🎉 *Transaction Successful!* 🎉

${fiatAmount} ${fiatCurrency} has been sent to your bank account!

Bank: ${bank}
Account: ${accountNumber} (${accountName})
Amount: ${fiatAmount} ${fiatCurrency}

Transaction ID: \`${txId}\`

Thank you for using Aboki! 💰
  `,
    Markup.inlineKeyboard([
      [Markup.button.callback("🏠 Back to Main Menu", "MAIN_MENU")],
    ])
  );

  return ctx.scene.leave();
}

// Authenticate wallet with API
async function authenticateWallet(walletAddress) {
  try {
    const response = await axios.post('https://aboki-api.onrender.com/api/ramp/auth/direct-auth', {
      walletAddress: walletAddress
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    return response;
  } catch (error) {
    console.error('Authentication error:', error);
    throw error;
  }
}

// Verify bank account with API
async function verifyBankAccount(accountDetails, token) {
  try {
    const response = await axios.post('https://aboki-api.onrender.com/api/ramp/auth/bank-accounts', {
      accountNumber: accountDetails.accountNumber,
      bankName: accountDetails.bankName,
      accountName: accountDetails.accountName,
      isDefault: accountDetails.isDefault || false
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('Error verifying bank account:', error);
    throw error;
  }
}

sellScene.action("CANCEL_TRANSACTION", (ctx) => {
  ctx.reply(
    "Transaction cancelled.",
    Markup.inlineKeyboard([
      [Markup.button.callback("Back to Main Menu", "MAIN_MENU")],
    ])
  );
  return ctx.scene.leave();
});

sellScene.action("MAIN_MENU", (ctx) => {
  ctx.scene.enter("main_menu");
});

// Helper function to generate a random wallet address
function generateRandomWalletAddress() {
  const prefix = '0x';
  const chars = '0123456789abcdef';
  let result = prefix;
  for (let i = 0; i < 40; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

module.exports = sellScene;