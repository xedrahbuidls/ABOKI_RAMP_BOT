// index.js
require('dotenv').config();
const { Telegraf, Markup, Scenes, session } = require("telegraf");
const { Stage } = Scenes;
const User = require('./db/models/user');
const connectDB = require('./db');
const { getMockBalances } = require('./services/walletService');
const axios = require('axios');

// Import scenes
const welcomeScene = require('./scenes/welcomeScene');
const mainMenuScene = require('./scenes/mainMenuScene');

// Import simplified scenes for onramp/offramp
const onrampScene = require('./scenes/onrampScene');
const offrampScene = require('./scenes/offrampScene');

// Connect to MongoDB
connectDB();

// Initialize bot
const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('BOT_TOKEN is not defined in environment variables');
  process.exit(1);
}

const bot = new Telegraf(token);

// Register scenes with simplified structure
const stage = new Stage([welcomeScene, onrampScene, offrampScene, mainMenuScene]);

// Common actions across scenes
stage.action("ONRAMP", (ctx) => ctx.scene.enter("onramp"));
stage.action("OFFRAMP", (ctx) => ctx.scene.enter("offramp"));
stage.action("MAIN_MENU", (ctx) => ctx.scene.enter("main_menu"));

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

// Global error handler for stage actions
stage.use(async (ctx, next) => {
  try {
    return await next();
  } catch (error) {
    console.error("Error in stage action:", error);
    try {
      if (ctx.callbackQuery) {
        await ctx.answerCbQuery("There was an error. Please try again.");
      }
    } catch (cbError) {
      console.error("Could not answer callback query:", cbError);
    }
  }
});

// Handle potential errors for actions
stage.action("GENERATE_WALLET", async (ctx) => {
  try {
    // Generate wallet directly
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
    console.error("Error handling GENERATE_WALLET action:", error);
    try {
      await ctx.answerCbQuery("There was an error. Please try again.");
    } catch (cbError) {
      console.error("Could not answer callback query:", cbError);
    }
  }
});

// WALLET_INFO with error handling
stage.action("WALLET_INFO", async (ctx) => {
  try {
    const user = await User.findOne({ userId: ctx.from.id });

    if (!user || !user.wallet) {
      // Generate wallet if user doesn't have one
      const generatedWallet = generateRandomWalletAddress();
      
      // Try to authenticate the wallet
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
      } catch (error) {
        console.error("Authentication error:", error);
        
        // Still create user without token
        await User.findOneAndUpdate(
          { userId: ctx.from.id },
          { 
            userId: ctx.from.id, 
            username: ctx.from.username, 
            wallet: generatedWallet
          },
          { upsert: true, new: true }
        );
      }
      
      try {
        await ctx.answerCbQuery("Wallet generated");
        await ctx.reply(`A wallet has been generated for you!\n\nAddress: \`${generatedWallet}\``, {
          parse_mode: 'Markdown'
        });
      } catch (replyError) {
        console.error("Could not send wallet message:", replyError);
      }
      
      // Get balances for the new wallet
      const mockBalances = getMockBalances();
      
      // Filter to only show USDC, BASE, and ZORA
      const filteredBalances = {
        USDC: mockBalances.USDC || '0.00',
        BASE: mockBalances.BASE || '0.00',
        ZORA: mockBalances.ZORA || '0.00'
      };
      
      let balanceText = "*Your Wallet Balances:*\n\n";
      for (const [coin, balance] of Object.entries(filteredBalances)) {
        balanceText += `${coin}: ${balance}\n`;
      }
      
      balanceText += `\nWallet Address: \`${generatedWallet}\``;
      
      try {
        await ctx.replyWithMarkdown(
          balanceText,
          Markup.inlineKeyboard([
            [Markup.button.callback("🏠 Back to Main Menu", "MAIN_MENU")],
          ])
        );
      } catch (markdownError) {
        console.error("Could not send balance markdown:", markdownError);
      }
      return;
    }

    // Get balances for existing wallet
    const mockBalances = getMockBalances();
    
    // Filter to only show USDC, BASE, and ZORA
    const filteredBalances = {
      USDC: mockBalances.USDC || '0.00',
      BASE: mockBalances.BASE || '0.00',
      ZORA: mockBalances.ZORA || '0.00'
    };

    let balanceText = "*Your Wallet Balances:*\n\n";
    for (const [coin, balance] of Object.entries(filteredBalances)) {
      balanceText += `${coin}: ${balance}\n`;
    }

    balanceText += `\nWallet Address: \`${user.wallet}\``;

    try {
      await ctx.answerCbQuery();
      await ctx.replyWithMarkdown(
        balanceText,
        Markup.inlineKeyboard([
          [Markup.button.callback("🏠 Back to Main Menu", "MAIN_MENU")],
        ])
      );
    } catch (markdownError) {
      console.error("Could not send balance markdown:", markdownError);
    }
  } catch (error) {
    console.error("Error in WALLET_INFO action:", error);
    try {
      await ctx.answerCbQuery("There was an error. Please try again.");
    } catch (cbError) {
      console.error("Could not answer callback query:", cbError);
    }
  }
});

// History action with error handling
stage.action("HISTORY", async (ctx) => {
  try {
    const user = await User.findOne({ userId: ctx.from.id });
    const transactions = user ? user.transactions || [] : [];

    if (transactions.length === 0) {
      try {
        await ctx.answerCbQuery();
        await ctx.replyWithMarkdown(
          "*No transactions yet*",
          Markup.inlineKeyboard([
            [Markup.button.callback("🏠 Back to Main Menu", "MAIN_MENU")],
          ])
        );
      } catch (replyError) {
        console.error("Could not send no transactions message:", replyError);
      }
      return;
    }

    let historyText = "*Transaction History:*\n\n";

    transactions.slice(0, 5).forEach((tx, i) => {
      const date = new Date(tx.timestamp).toLocaleDateString();
      if (tx.type === "onramp") {
        historyText += `${i + 1}. BUY: ${tx.amount} ${tx.currency} (${date})\n`;
      } else if (tx.type === "offramp") {
        historyText += `${i + 1}. SELL: ${tx.amount} ${tx.currency} → ${tx.received} NGN (${date})\n`;
      }
    });

    try {
      await ctx.answerCbQuery();
      await ctx.replyWithMarkdown(
        historyText,
        Markup.inlineKeyboard([
          [Markup.button.callback("🏠 Back to Main Menu", "MAIN_MENU")],
        ])
      );
    } catch (markdownError) {
      console.error("Could not send history message:", markdownError);
    }
  } catch (error) {
    console.error("Error in HISTORY action:", error);
    try {
      await ctx.answerCbQuery("There was an error. Please try again.");
    } catch (cbError) {
      console.error("Could not answer callback query:", cbError);
    }
  }
});

stage.action("HELP", async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.replyWithMarkdownV2(
      `*Need Help?* 🤔

Here are some common commands:
\\- /start \\- Start the bot
\\- /onramp \\- Buy USDC, BASE, or ZORA
\\- /offramp \\- Sell crypto for NGN
\\- /wallet \\- View wallet information
\\- /history \\- View transaction history

Contact support: @aboki\\_support`,
      Markup.inlineKeyboard([
        [Markup.button.callback("🏠 Back to Main Menu", "MAIN_MENU")],
      ])
    );
  } catch (error) {
    console.error("Error in HELP action:", error);
    try {
      await ctx.answerCbQuery("There was an error. Please try again.");
    } catch (cbError) {
      console.error("Could not answer callback query:", cbError);
    }
  }
});

// Setup middleware
bot.use(session());
bot.use(stage.middleware());

// Add global error handler
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
});

// Command handlers with error handling
bot.command("start", async (ctx) => {
  try {
    await ctx.scene.enter("welcome");
  } catch (error) {
    console.error("Error in start command:", error);
    try {
      await ctx.reply("Welcome to Aboki Exchange! Type /help for available commands.");
    } catch (replyError) {
      console.error("Could not send welcome message:", replyError);
    }
  }
});

bot.command("onramp", async (ctx) => {
  try {
    await ctx.scene.enter("onramp");
  } catch (error) {
    console.error("Error in onramp command:", error);
    try {
      await ctx.reply("There was an error starting the onramp process. Please try again later.");
    } catch (replyError) {
      console.error("Could not send error message:", replyError);
    }
  }
});

bot.command("offramp", async (ctx) => {
  try {
    await ctx.scene.enter("offramp");
  } catch (error) {
    console.error("Error in offramp command:", error);
    try {
      await ctx.reply("There was an error starting the offramp process. Please try again later.");
    } catch (replyError) {
      console.error("Could not send error message:", replyError);
    }
  }
});

bot.command("wallet", async (ctx) => {
  try {
    await ctx.action("WALLET_INFO");
  } catch (error) {
    console.error("Error in wallet command:", error);
    try {
      await ctx.reply("There was an error retrieving your wallet information. Please try again later.");
    } catch (replyError) {
      console.error("Could not send error message:", replyError);
    }
  }
});

bot.command("history", async (ctx) => {
  try {
    await ctx.action("HISTORY");
  } catch (error) {
    console.error("Error in history command:", error);
    try {
      await ctx.reply("There was an error retrieving your transaction history. Please try again later.");
    } catch (replyError) {
      console.error("Could not send error message:", replyError);
    }
  }
});

bot.command("help", async (ctx) => {
  try {
    await ctx.action("HELP");
  } catch (error) {
    console.error("Error in help command:", error);
    try {
      await ctx.reply("Available commands: /start, /onramp, /offramp, /wallet, /history");
    } catch (replyError) {
      console.error("Could not send help message:", replyError);
    }
  }
});

// Start the bot
bot.launch()
  .then(() => {
    console.log("Bot started successfully!");
  })
  .catch((err) => {
    console.error("Failed to start bot:", err);
  });

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));