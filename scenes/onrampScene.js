// scenes/onrampScene.js
const { Scenes, Markup } = require("telegraf");
const { BaseScene } = Scenes;
const User = require('../db/models/user');
const axios = require('axios');

// Available cryptocurrencies for onramp
const AVAILABLE_CRYPTOS = ['USDC', 'BASE', 'ZORA'];

// Create the onramp scene
const onrampScene = new BaseScene("onramp");

// Initialize the scene
onrampScene.enter(async (ctx) => {
  try {
    await ctx.reply(
      "Welcome to Crypto Onramp (Buy) 💰\n\nPlease select a cryptocurrency to purchase:",
      Markup.inlineKeyboard([
        [
          Markup.button.callback("USDC", "CRYPTO_USDC"),
          Markup.button.callback("BASE", "CRYPTO_BASE"),
          Markup.button.callback("ZORA", "CRYPTO_ZORA"),
        ],
        [Markup.button.callback("🔙 Back to Main Menu", "MAIN_MENU")],
      ])
    );
  } catch (error) {
    console.error("Error entering onramp scene:", error);
    await ctx.reply("Sorry, there was an error. Please try again later.");
    await ctx.scene.enter("main_menu");
  }
});

// Handle crypto selection
for (const crypto of AVAILABLE_CRYPTOS) {
  onrampScene.action(`CRYPTO_${crypto}`, async (ctx) => {
    try {
      // Save selected crypto to session
      ctx.scene.state.selectedCrypto = crypto;
      
      await ctx.answerCbQuery();
      await ctx.reply(
        `You selected ${crypto}. Please enter the amount in NGN you want to spend (minimum 5,000 NGN):`,
        Markup.inlineKeyboard([
          [Markup.button.callback("🔙 Change Currency", "CHANGE_CURRENCY")],
          [Markup.button.callback("🔙 Back to Main Menu", "MAIN_MENU")],
        ])
      );
      
      // Move to the next state
      ctx.scene.state.waitingForAmount = true;
    } catch (error) {
      console.error(`Error selecting ${crypto}:`, error);
      await ctx.answerCbQuery("There was an error. Please try again.");
      await ctx.reply("Sorry, there was an error. Please try again later.");
    }
  });
}

// Allow user to change their selected currency
onrampScene.action("CHANGE_CURRENCY", async (ctx) => {
  try {
    await ctx.answerCbQuery();
    // Reset the state
    ctx.scene.state.selectedCrypto = null;
    ctx.scene.state.waitingForAmount = false;
    
    // Show the currency selection again
    await ctx.reply(
      "Please select a cryptocurrency to purchase:",
      Markup.inlineKeyboard([
        [
          Markup.button.callback("USDC", "CRYPTO_USDC"),
          Markup.button.callback("BASE", "CRYPTO_BASE"),
          Markup.button.callback("ZORA", "CRYPTO_ZORA"),
        ],
        [Markup.button.callback("🔙 Back to Main Menu", "MAIN_MENU")],
      ])
    );
  } catch (error) {
    console.error("Error changing currency:", error);
    await ctx.answerCbQuery("There was an error. Please try again.");
    await ctx.reply("Sorry, there was an error. Please try again later.");
  }
});

// Handle amount input
onrampScene.on("text", async (ctx) => {
  try {
    // Only process if we're waiting for an amount
    if (!ctx.scene.state.waitingForAmount) return;
    
    const amount = parseFloat(ctx.message.text.replace(/,/g, ""));
    
    // Validate the amount
    if (isNaN(amount) || amount < 5000) {
      await ctx.reply(
        "Please enter a valid amount (minimum 5,000 NGN):",
        Markup.inlineKeyboard([
          [Markup.button.callback("🔙 Change Currency", "CHANGE_CURRENCY")],
          [Markup.button.callback("🔙 Back to Main Menu", "MAIN_MENU")],
        ])
      );
      return;
    }
    
    // Store the amount
    ctx.scene.state.amount = amount;
    
    // Mock exchange rate (in reality, you would fetch this from an API)
    let rate;
    switch (ctx.scene.state.selectedCrypto) {
      case "USDC":
        rate = 1600; // 1 USDC = 1600 NGN
        break;
      case "BASE":
        rate = 4500; // 1 BASE = 4500 NGN
        break;
      case "ZORA":
        rate = 1200; // 1 ZORA = 1200 NGN
        break;
      default:
        rate = 1600;
    }
    
    // Calculate how much crypto they'll receive
    const cryptoAmount = amount / rate;
    const formattedCryptoAmount = cryptoAmount.toFixed(6);
    
    // Show confirmation
    await ctx.reply(
      `You will receive approximately ${formattedCryptoAmount} ${ctx.scene.state.selectedCrypto} for ${amount.toLocaleString()} NGN.\n\nPlease confirm your purchase:`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback("✅ Confirm", "CONFIRM_PURCHASE"),
          Markup.button.callback("❌ Cancel", "CANCEL_PURCHASE")
        ]
      ])
    );
    
    // Update state
    ctx.scene.state.waitingForAmount = false;
    ctx.scene.state.waitingForConfirmation = true;
    ctx.scene.state.cryptoAmount = formattedCryptoAmount;
    ctx.scene.state.rate = rate;
  } catch (error) {
    console.error("Error processing amount:", error);
    await ctx.reply("Sorry, there was an error processing your input. Please try again.");
  }
});

// Confirm purchase
onrampScene.action("CONFIRM_PURCHASE", async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    if (!ctx.scene.state.waitingForConfirmation) return;
    
    // Get user wallet
    const user = await User.findOne({ userId: ctx.from.id });
    
    if (!user || !user.wallet) {
      await ctx.reply("You need a wallet to continue. Generating one for you...");
      // Trigger wallet generation action
      await ctx.action("GENERATE_WALLET");
      return;
    }
    
    // Mock payment processing - in production, you would integrate with payment provider
    await ctx.reply("Processing your payment... Please wait.");
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Save transaction to user history
    await User.findOneAndUpdate(
      { userId: ctx.from.id },
      {
        $push: {
          transactions: {
            type: "onramp",
            currency: ctx.scene.state.selectedCrypto,
            amount: ctx.scene.state.cryptoAmount,
            ngn_amount: ctx.scene.state.amount,
            rate: ctx.scene.state.rate,
            timestamp: new Date()
          }
        }
      }
    );
    
    // Send success message
    await ctx.reply(
      `✅ Success! You've purchased ${ctx.scene.state.cryptoAmount} ${ctx.scene.state.selectedCrypto}.\n\nYour crypto has been added to your wallet.`,
      Markup.inlineKeyboard([
        [Markup.button.callback("👛 View Wallet", "WALLET_INFO")],
        [Markup.button.callback("🔙 Back to Main Menu", "MAIN_MENU")]
      ])
    );
    
  } catch (error) {
    console.error("Error confirming purchase:", error);
    await ctx.reply(
      "Sorry, there was an error processing your purchase. Please try again later.",
      Markup.inlineKeyboard([
        [Markup.button.callback("🔙 Back to Main Menu", "MAIN_MENU")]
      ])
    );
  }
});

// Cancel purchase
onrampScene.action("CANCEL_PURCHASE", async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.reply(
      "Purchase cancelled. What would you like to do next?",
      Markup.inlineKeyboard([
        [Markup.button.callback("🔄 Buy Different Amount", "CHANGE_AMOUNT")],
        [Markup.button.callback("🔙 Back to Main Menu", "MAIN_MENU")]
      ])
    );
  } catch (error) {
    console.error("Error cancelling purchase:", error);
    await ctx.reply("Sorry, there was an error. Returning to main menu...");
    await ctx.scene.enter("main_menu");
  }
});

// Change amount action
onrampScene.action("CHANGE_AMOUNT", async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    // Reset state but keep the selected crypto
    ctx.scene.state.waitingForAmount = true;
    ctx.scene.state.waitingForConfirmation = false;
    
    await ctx.reply(
      `Please enter a new amount in NGN to spend on ${ctx.scene.state.selectedCrypto} (minimum 5,000 NGN):`,
      Markup.inlineKeyboard([
        [Markup.button.callback("🔙 Change Currency", "CHANGE_CURRENCY")],
        [Markup.button.callback("🔙 Back to Main Menu", "MAIN_MENU")],
      ])
    );
  } catch (error) {
    console.error("Error changing amount:", error);
    await ctx.reply("Sorry, there was an error. Please try again later.");
  }
});

module.exports = onrampScene;