// scenes/loginScene.js
const { Scenes, Markup } = require('telegraf');
const { BaseScene } = Scenes;
const User = require('../db/models/user');
const axios = require('axios');

const loginScene = new BaseScene('login');

loginScene.enter(async (ctx) => {
  const user = await User.findOne({ userId: ctx.from.id });
  
  // If user already has a verified wallet, skip to the next scene
  if (user && user.wallet && user.isAuthenticated) {
    const returnScene = ctx.scene.state.returnScene || 'main_menu';
    const action = ctx.scene.state.action;
    
    if (action) {
      await ctx.action(action);
    } else {
      await ctx.scene.enter(returnScene);
    }
    return;
  }

  // If this is the initial login (from /start command)
  if (ctx.scene.state.isInitialLogin) {
    await ctx.replyWithMarkdown(
      "👋 *Welcome to the Crypto Trading Bot!*\n\n" +
      "To use our services, you need to authenticate with your wallet address.\n" +
      "Please enter your wallet address below:"
    );
  } else {
    await ctx.replyWithMarkdown(
      "⚠️ *Authentication Required*\n\n" +
      "Please enter your wallet address to continue:"
    );
  }
  
  // Set the scene state to wait for wallet input
  ctx.scene.state.waitingForWallet = true;
});

// Handle text input (for wallet address)
loginScene.on('text', async (ctx) => {
  if (!ctx.scene.state.waitingForWallet) return;

  const walletAddress = ctx.message.text.trim();
  
  // Basic validation for wallet address format
  // You might want to implement a more sophisticated validation
  if (!isValidWalletFormat(walletAddress)) {
    await ctx.reply(
      "⚠️ Invalid wallet address format. Please try again:",
      Markup.inlineKeyboard([
        [Markup.button.callback("❓ Help", "WALLET_HELP")],
        [Markup.button.callback("🔙 Cancel", "CANCEL_LOGIN")]
      ])
    );
    return;
  }

  // Show loading message
  const loadingMsg = await ctx.reply("🔄 Authenticating your wallet...");

  try {
    // Call the authentication API
    const authResult = await authenticateWallet(walletAddress);
    
    if (authResult && authResult.success) {
      // Update or create user in the database
      let user = await User.findOne({ userId: ctx.from.id });
      
      if (user) {
        user.wallet = walletAddress;
        user.isAuthenticated = true;
        await user.save();
      } else {
        user = new User({
          userId: ctx.from.id,
          username: ctx.from.username || '',
          firstName: ctx.from.first_name || '',
          lastName: ctx.from.last_name || '',
          wallet: walletAddress,
          isAuthenticated: true,
          transactions: [],
          createdAt: new Date()
        });
        await user.save();
      }

      // Delete loading message
      await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
      
      // Success message
      await ctx.replyWithMarkdown(
        "✅ *Wallet authenticated successfully!*\n" +
        `Your wallet \`${walletAddress}\` has been connected.`
      );
      
      // Navigate to the next scene or action
      const returnScene = ctx.scene.state.returnScene || 'main_menu';
      const action = ctx.scene.state.action;
      
      if (action) {
        await ctx.action(action);
      } else {
        await ctx.scene.enter(returnScene);
      }
    } else {
      // Delete loading message
      await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
      
      // Authentication failed
      await ctx.reply(
        "❌ Authentication failed. Please check your wallet address and try again.",
        Markup.inlineKeyboard([
          [Markup.button.callback("🔄 Try Again", "TRY_AGAIN")],
          [Markup.button.callback("❓ Help", "WALLET_HELP")]
        ])
      );
    }
  } catch (error) {
    console.error("Authentication error:", error);
    
    // Delete loading message
    await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
    
    // Error message
    await ctx.reply(
      "❌ An error occurred during authentication. Please try again later.",
      Markup.inlineKeyboard([
        [Markup.button.callback("🔄 Try Again", "TRY_AGAIN")],
        [Markup.button.callback("❓ Help", "WALLET_HELP")]
      ])
    );
  }
});

// Handle actions
loginScene.action("TRY_AGAIN", (ctx) => {
  ctx.answerCbQuery();
  ctx.scene.reenter();
});

loginScene.action("WALLET_HELP", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.replyWithMarkdown(
    "*How to provide your wallet address:*\n\n" +
    "1. Open your crypto wallet app\n" +
    "2. Find your wallet address (usually a long string starting with 0x for Ethereum-based wallets)\n" +
    "3. Copy the complete address\n" +
    "4. Paste it here\n\n" +
    "Example: `0xD8f24D419153E5D03d614C5155f9C9CB35b40F76`\n\n" +
    "If you don't have a wallet yet, you can create one using services like MetaMask, Trust Wallet, or Coinbase Wallet.",
    Markup.inlineKeyboard([
      [Markup.button.callback("🔙 Back", "TRY_AGAIN")]
    ])
  );
});

loginScene.action("CANCEL_LOGIN", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    "Login canceled. You can authenticate anytime by using the /start command."
  );
  await ctx.scene.leave();
});

// Helper functions
function isValidWalletFormat(walletAddress) {
  // Basic validation for Ethereum-like addresses
  // You can enhance this validation based on the type of wallets you support
  const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
  return ethAddressRegex.test(walletAddress);
}

async function authenticateWallet(walletAddress) {
  try {
    const response = await axios.post('https://aboki-api.onrender.com/api/ramp/auth/direct-auth', {
      walletAddress: walletAddress
    });
    return response.data;
  } catch (error) {
    console.error('Authentication error:', error);
    return null;
  }
}

module.exports = loginScene;