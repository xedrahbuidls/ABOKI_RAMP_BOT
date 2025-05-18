// scenes/buyScene.js
const { Markup } = require("telegraf");
const { BaseScene } = require("telegraf/scenes");
const User = require("../db/models/user");
const { SUPPORTED_CRYPTO } = require("../config/constant.js");
const axios = require("axios");

const buyScene = new BaseScene("buy");

buyScene.enter(async (ctx) => {
  try {
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
        
        await ctx.reply(
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
        
        await ctx.reply(
          `A wallet has been generated for you!\n\nAddress: \`${generatedWallet}\``,
          { parse_mode: 'Markdown' }
        );
      }
    }

    // Provide instructions for buying crypto
    await ctx.replyWithMarkdown(
      `*Buy Cryptocurrency*\n\nYou'll be purchasing crypto with NGN (Nigerian Naira).\n\nPlease enter the amount in NGN you want to use for purchase:`
    );
    
    // Set scene state
    ctx.scene.session.awaitingFiatAmount = true;
  } catch (error) {
    console.error("Error in buy scene enter:", error);
    try {
      await ctx.reply("There was an error starting the buy process. Please try again later.");
      return ctx.scene.leave();
    } catch (replyError) {
      console.error("Could not send error message:", replyError);
    }
  }
});

buyScene.on("text", async (ctx) => {
  try {
    // Check if waiting for fiat amount
    if (ctx.scene.session.awaitingFiatAmount) {
      const fiatAmount = parseFloat(ctx.message.text.trim());
      
      if (isNaN(fiatAmount) || fiatAmount <= 0) {
        return ctx.replyWithMarkdown(
          "⚠️ *Invalid amount*\n\nPlease enter a valid number greater than 0"
        );
      }
      
      if (fiatAmount < 100) {
        return ctx.replyWithMarkdown(
          "⚠️ *Amount too small*\n\nThe minimum amount is 100 NGN"
        );
      }
      
      // Store amount in session
      ctx.scene.session.fiatAmount = fiatAmount;
      ctx.scene.session.awaitingFiatAmount = false;
      
      // Ask which crypto they want to buy
      await ctx.replyWithMarkdown(
        "*Select cryptocurrency to purchase:*",
        Markup.inlineKeyboard(
          SUPPORTED_CRYPTO.map((crypto) => [
            Markup.button.callback(crypto, `BUY_CRYPTO_${crypto}`),
          ])
        )
      );
    }
  } catch (error) {
    console.error("Error processing text input:", error);
    try {
      await ctx.reply("There was an error processing your input. Please try again.");
    } catch (replyError) {
      console.error("Could not send error message:", replyError);
    }
  }
});

buyScene.action(/BUY_CRYPTO_(.+)/, async (ctx) => {
  try {
    const cryptoCurrency = ctx.match[1];
    const { fiatAmount } = ctx.scene.session;
    
    // Store selected crypto
    ctx.scene.session.cryptoCurrency = cryptoCurrency;
    
    // Calculate estimated crypto amount (this would normally come from an API)
    const estimatedCryptoAmount = calculateEstimatedAmount(fiatAmount, cryptoCurrency);
    
    await ctx.answerCbQuery();
    await ctx.replyWithMarkdown(
      `
*Confirm Purchase:*

Amount: ${fiatAmount.toFixed(2)} NGN
Estimated ${cryptoCurrency}: ~${estimatedCryptoAmount.toFixed(6)} ${cryptoCurrency}

Do you want to proceed?
      `,
      Markup.inlineKeyboard([
        [
          Markup.button.callback("✅ Confirm", "CONFIRM_BUY"),
          Markup.button.callback("❌ Cancel", "CANCEL_TRANSACTION"),
        ],
      ])
    );
  } catch (error) {
    console.error("Error selecting crypto:", error);
    try {
      await ctx.answerCbQuery("There was an error. Please try again.");
    } catch (cbError) {
      console.error("Could not answer callback query:", cbError);
    }
  }
});

buyScene.action("CONFIRM_BUY", async (ctx) => {
  try {
    const user = await User.findOne({ userId: ctx.from.id });
    
    if (!user || !user.wallet || !user.authToken) {
      await ctx.answerCbQuery("Authentication required");
      await ctx.reply("You need to be authenticated to complete this purchase. Please restart the process.");
      return ctx.scene.enter("welcome");
    }
    
    const { fiatAmount, cryptoCurrency } = ctx.scene.session;
    
    // Show processing message
    await ctx.answerCbQuery();
    await ctx.replyWithMarkdown(
      `
*Processing Your Order* ⏳

Amount: ${fiatAmount.toFixed(2)} NGN
Crypto: ${cryptoCurrency}
Recipient Address: \`${user.wallet}\`

Please wait while we create your order...
      `
    );
    
    try {
      // Create onramp order
      const orderResponse = await createOnrampOrder(
        fiatAmount,
        user.wallet,
        user.authToken
      );
      
      // Store order details in session
      const orderData = orderResponse.data.order;
      const paymentData = orderResponse.data.payment;
      
      // Save transaction to database
      await User.findOneAndUpdate(
        { userId: ctx.from.id },
        { 
          $push: { 
            transactions: {
              type: "buy",
              amount: orderData.targetAmount,
              currency: orderData.targetCurrency,
              received: orderData.sourceAmount,
              receivedCurrency: orderData.sourceCurrency,
              txHash: paymentData.paymentReference,
              timestamp: new Date()
            }
          }
        }
      );
      
      // Show order success and payment link
      await ctx.replyWithMarkdown(
        `
🎉 *Order Created Successfully!* 🎉

Amount: ${fiatAmount.toFixed(2)} NGN
Estimated ${cryptoCurrency}: ${orderData.targetAmount.toFixed(6)} ${cryptoCurrency}
Recipient Address: \`${user.wallet}\`

Order ID: \`${orderData.id}\`
Status: ${orderData.status.toUpperCase()}

*Payment Instructions:*
1. Click the payment link below to complete your payment
2. You have ${orderResponse.data.expiresInMinutes} minutes to complete the payment
3. After payment, your ${cryptoCurrency} will be sent to your wallet

*Payment Link:* [Complete Your Payment](${paymentData.checkoutUrl})

Reference: \`${paymentData.paymentReference}\`
        `,
        Markup.inlineKeyboard([
          [Markup.button.url("Pay Now", paymentData.checkoutUrl)],
          [Markup.button.callback("🏠 Back to Main Menu", "MAIN_MENU")],
        ])
      );
      
      return ctx.scene.leave();
    } catch (orderError) {
      console.error("Error creating onramp order:", orderError);
      
      await ctx.replyWithMarkdown(
        `
⚠️ *Order Creation Failed*

There was an error processing your order. Please try again later.

Error: ${orderError.response?.data?.message || "Unknown error"}
        `,
        Markup.inlineKeyboard([
          [Markup.button.callback("🔄 Try Again", "TRY_AGAIN")],
          [Markup.button.callback("🏠 Back to Main Menu", "MAIN_MENU")],
        ])
      );
    }
  } catch (error) {
    console.error("Error confirming buy:", error);
    try {
      await ctx.answerCbQuery("There was an error. Please try again.");
      await ctx.reply(
        "There was an error processing your order. Please try again later.",
        Markup.inlineKeyboard([
          [Markup.button.callback("🏠 Back to Main Menu", "MAIN_MENU")],
        ])
      );
    } catch (replyError) {
      console.error("Could not send error message:", replyError);
    }
  }
});

buyScene.action("TRY_AGAIN", async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.scene.reenter();
  } catch (error) {
    console.error("Error trying again:", error);
    try {
      await ctx.answerCbQuery("There was an error. Please try again.");
    } catch (cbError) {
      console.error("Could not answer callback query:", cbError);
    }
  }
});

buyScene.action("CANCEL_TRANSACTION", async (ctx) => {
  try {
    await ctx.answerCbQuery("Transaction cancelled");
    await ctx.reply(
      "Transaction cancelled.",
      Markup.inlineKeyboard([
        [Markup.button.callback("Back to Main Menu", "MAIN_MENU")],
      ])
    );
    return ctx.scene.leave();
  } catch (error) {
    console.error("Error cancelling transaction:", error);
    try {
      await ctx.answerCbQuery("There was an error. Please try again.");
    } catch (cbError) {
      console.error("Could not answer callback query:", cbError);
    }
  }
});

buyScene.action("MAIN_MENU", async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.scene.enter("main_menu");
  } catch (error) {
    console.error("Error going to main menu:", error);
    try {
      await ctx.answerCbQuery("There was an error. Please try again.");
    } catch (cbError) {
      console.error("Could not answer callback query:", cbError);
    }
  }
});

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

// Create onramp order
async function createOnrampOrder(amount, walletAddress, token) {
  try {
    const response = await axios.post('https://aboki-api.onrender.com/api/ramp/onramp', {
      amount: amount,
      recipientWalletAddress: walletAddress
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    return response;
  } catch (error) {
    console.error('Onramp order error:', error);
    throw error;
  }
}

// Calculate estimated amount (mock function)
function calculateEstimatedAmount(fiatAmount, cryptoCurrency) {
  // These are mock exchange rates
  const rates = {
    'USDC': 0.000618, // NGN to USDC
    'USDT': 0.000617, // NGN to USDT
    'ETH': 0.0000003, // NGN to ETH
    'BTC': 0.00000001, // NGN to BTC
  };
  
  return fiatAmount * (rates[cryptoCurrency] || 0.0001);
}

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

module.exports = buyScene;