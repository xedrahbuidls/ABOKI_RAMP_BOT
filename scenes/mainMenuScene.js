// scenes/mainMenuScene.js
const { Scenes, Markup } = require('telegraf');
const { BaseScene } = Scenes;
const User = require('../db/models/user');

// Create main menu scene
const mainMenuScene = new BaseScene('main_menu');

mainMenuScene.enter(async (ctx) => {
  try {
    // Check if user exists in database
    const user = await User.findOne({ userId: ctx.from.id });

    // Show main menu regardless of authentication status
    await ctx.replyWithMarkdown(
      `*Main Menu*\n\nWelcome to Aboki Exchange, ${ctx.from.first_name}!\nWhat would you like to do today?`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback("💰 Buy", "BUY"),
          Markup.button.callback("💱 Sell", "SELL"),
        ],
        [
          Markup.button.callback("👛 Wallet", "WALLET_INFO"),
          Markup.button.callback("📜 History", "HISTORY"),
        ],
        [Markup.button.callback("❓ Help", "HELP")],
      ])
    );
  } catch (error) {
    console.error("Error in main menu scene:", error);
    // If there's an error, try to send a basic menu
    try {
      await ctx.reply(
        "Main Menu - Aboki Exchange",
        Markup.inlineKeyboard([
          [
            Markup.button.callback("Buy", "BUY"),
            Markup.button.callback("Sell", "SELL"),
          ],
          [Markup.button.callback("Help", "HELP")],
        ])
      );
    } catch (replyError) {
      console.error("Could not send main menu:", replyError);
    }
  }
});

mainMenuScene.action("BUY", async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.scene.enter("buy");
  } catch (error) {
    console.error("Error in BUY action:", error);
    try {
      await ctx.answerCbQuery("There was an error. Please try again.");
    } catch (cbError) {
      console.error("Could not answer callback query:", cbError);
    }
  }
});

mainMenuScene.action("SELL", async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.scene.enter("sell");
  } catch (error) {
    console.error("Error in SELL action:", error);
    try {
      await ctx.answerCbQuery("There was an error. Please try again.");
    } catch (cbError) {
      console.error("Could not answer callback query:", cbError);
    }
  }
});

mainMenuScene.action("WALLET_INFO", async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.action("WALLET_INFO");
  } catch (error) {
    console.error("Error in WALLET_INFO action:", error);
    try {
      await ctx.answerCbQuery("There was an error. Please try again.");
    } catch (cbError) {
      console.error("Could not answer callback query:", cbError);
    }
  }
});

mainMenuScene.action("HISTORY", async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.action("HISTORY");
  } catch (error) {
    console.error("Error in HISTORY action:", error);
    try {
      await ctx.answerCbQuery("There was an error. Please try again.");
    } catch (cbError) {
      console.error("Could not answer callback query:", cbError);
    }
  }
});

mainMenuScene.action("HELP", async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.action("HELP");
  } catch (error) {
    console.error("Error in HELP action:", error);
    try {
      await ctx.answerCbQuery("There was an error. Please try again.");
    } catch (cbError) {
      console.error("Could not answer callback query:", cbError);
    }
  }
});

module.exports = mainMenuScene;