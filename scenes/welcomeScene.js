// welcomeScene.js
const { Scenes, Markup } = require('telegraf');
const { BaseScene } = Scenes;
const User = require('../db/models/user');
const axios = require('axios');

// Welcome scene
const welcomeScene = new BaseScene('welcome');

// Scene enter handler
welcomeScene.enter(async (ctx) => {
  try {
    // Check if user exists in database
    const user = await User.findOne({ userId: ctx.from.id });
    
    if (user && user.wallet) {
      // User already exists
      
      // If they don't have an auth token yet, try to get one
      if (!user.authToken) {
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
      
      ctx.reply(`Welcome back to Aboki Exchange, ${ctx.from.first_name}! 🚀`);
      return ctx.scene.enter('main_menu');
    }
    
    // Create a new user with a generated wallet
    const generatedWallet = generateRandomWalletAddress();
    
    try {
      // Try to authenticate the wallet with the API
      const authResponse = await authenticateWallet(generatedWallet);
      const authToken = authResponse.data.data.token;
      
      // Create user with wallet and token
      await User.create({
        userId: ctx.from.id,
        username: ctx.from.username,
        wallet: generatedWallet,
        authToken: authToken
      });
      
      // Welcome message for new users
      await ctx.reply(
        `Welcome to Aboki Exchange Bot, ${ctx.from.first_name}! 🚀\n\nA wallet has been automatically generated and authenticated for you.\n\nWallet Address: \`${generatedWallet}\``,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback("Continue to Main Menu", "MAIN_MENU")]
          ])
        }
      );
    } catch (error) {
      console.error("Authentication error:", error);
      
      // Still create the user but without token
      await User.create({
        userId: ctx.from.id,
        username: ctx.from.username,
        wallet: generatedWallet
      });
      
      // Welcome message for new users
      await ctx.reply(
        `Welcome to Aboki Exchange Bot, ${ctx.from.first_name}! 🚀\n\nA wallet has been automatically generated for you.\n\nWallet Address: \`${generatedWallet}\``,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback("Continue to Main Menu", "MAIN_MENU")]
          ])
        }
      );
    }
  } catch (error) {
    console.error("Error in welcome scene:", error);
    // Try to send a generic message if possible
    try {
      await ctx.reply("Welcome to Aboki Exchange! Let's get started.");
      return ctx.scene.enter('main_menu');
    } catch (replyError) {
      console.error("Could not send welcome message:", replyError);
    }
  }
});

// Handle authenticate wallet action safely
welcomeScene.action('AUTHENTICATE_WALLET', async (ctx) => {
  try {
    // Generate a wallet directly instead of redirecting to auth scene
    const generatedWallet = generateRandomWalletAddress();
    
    try {
      // Try to authenticate the wallet with the API
      const authResponse = await authenticateWallet(generatedWallet);
      const authToken = authResponse.data.data.token;
      
      await User.findOneAndUpdate(
        { userId: ctx.from.id },
        { 
          wallet: generatedWallet,
          authToken: authToken 
        },
        { upsert: true }
      );
      
      await ctx.answerCbQuery("Wallet authenticated successfully");
      await ctx.reply(`Your wallet has been generated and authenticated!\n\nWallet Address: \`${generatedWallet}\``, {
        parse_mode: 'Markdown'
      });
    } catch (error) {
      console.error("Authentication error:", error);
      
      // Still update the wallet without token
      await User.findOneAndUpdate(
        { userId: ctx.from.id },
        { wallet: generatedWallet },
        { upsert: true }
      );
      
      await ctx.answerCbQuery("Wallet generated");
      await ctx.reply(`A wallet has been generated for you!\n\nWallet Address: \`${generatedWallet}\``, {
        parse_mode: 'Markdown'
      });
    }
    
    return ctx.scene.enter('main_menu');
  } catch (error) {
    console.error("Error handling AUTHENTICATE_WALLET action:", error);
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

// Generate a random wallet address
function generateRandomWalletAddress() {
  const prefix = '0x';
  const chars = '0123456789abcdef';
  let result = prefix;
  for (let i = 0; i < 40; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

module.exports = welcomeScene;