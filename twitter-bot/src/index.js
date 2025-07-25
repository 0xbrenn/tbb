// src/index.js
const config = require('../config');
const logger = require('./utils/logger');
const schedulerService = require('./services/scheduler.service');
const aiService = require('./services/ai.service');
const supabaseService = require('./services/supabase.service');

async function start() {
  try {
    logger.info('Starting Twitter Bot...');
    logger.info('Environment:', process.env.NODE_ENV);
    logger.info('Auto-posting:', config.bot.enableAutoPosting);

    // Initialize AI service
    await aiService.initialize();

    // Start scheduler
    schedulerService.start();

    // Start test dashboard if in test mode
    if (!config.bot.enableAutoPosting) {
      logger.info('Starting test dashboard...');
      require('./test-mode/dashboard');
    }

    logger.info('Twitter Bot started successfully!');
    
    // Keep process alive
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    
  } catch (error) {
    logger.error('Failed to start Twitter Bot:', error);
    process.exit(1);
  }
}

async function shutdown() {
  logger.info('Shutting down Twitter Bot...');
  
  try {
    schedulerService.stop();
    logger.info('Twitter Bot shut down successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Start the bot
start();