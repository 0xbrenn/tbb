// src/services/scheduler.service.js
const cron = require('node-cron');
const config = require('../../config');
const logger = require('../utils/logger');
const tweetController = require('../controllers/tweet.controller');
const responseController = require('../controllers/response.controller');

class SchedulerService {
  constructor() {
    this.jobs = new Map();
  }

  start() {
    logger.info('Starting scheduler service...');

    // Schedule tweet generation
    this._scheduleTweetGeneration();

    // Schedule mention checking
    this._scheduleMentionChecking();

    // Schedule scheduled posts processing
    this._schedulePostProcessing();

    // Schedule cleanup tasks
    this._scheduleCleanup();

    logger.info('Scheduler service started successfully');
  }

  stop() {
    logger.info('Stopping scheduler service...');
    
    this.jobs.forEach((job, name) => {
      job.stop();
      logger.info(`Stopped job: ${name}`);
    });

    this.jobs.clear();
    logger.info('Scheduler service stopped');
  }

  _scheduleTweetGeneration() {
    // Calculate cron expression based on tweets per day
    const tweetsPerDay = config.bot.tweetsPerDay;
    const hours = Math.floor(24 / tweetsPerDay);
    
    // Generate tweets at regular intervals
    const cronExpression = `0 */${hours} * * *`;
    
    const job = cron.schedule(cronExpression, async () => {
      try {
        logger.info('Running scheduled tweet generation...');
        await tweetController.generateScheduledTweet();
      } catch (error) {
        logger.error('Error in scheduled tweet generation:', error);
      }
    });

    this.jobs.set('tweetGeneration', job);
    logger.info(`Scheduled tweet generation: ${tweetsPerDay} tweets per day`);
  }

  _scheduleMentionChecking() {
    // Check mentions every 5 minutes
    const job = cron.schedule('*/5 * * * *', async () => {
      try {
        logger.info('Checking for new mentions...');
        await responseController.checkAndReplyToMentions();
      } catch (error) {
        logger.error('Error checking mentions:', error);
      }
    });

    this.jobs.set('mentionChecking', job);
    logger.info('Scheduled mention checking: every 5 minutes');
  }

  _schedulePostProcessing() {
    // Process scheduled posts every minute
    const job = cron.schedule('* * * * *', async () => {
      try {
        await tweetController.processScheduledPosts();
      } catch (error) {
        logger.error('Error processing scheduled posts:', error);
      }
    });

    this.jobs.set('postProcessing', job);
    logger.info('Scheduled post processing: every minute');
  }

  _scheduleCleanup() {
    // Run cleanup tasks daily at 3 AM
    const job = cron.schedule('0 3 * * *', async () => {
      try {
        logger.info('Running cleanup tasks...');
        
        // Clean old test queue items
        await this._cleanOldTestItems();
        
        // Archive old interactions
        await this._archiveOldInteractions();
        
        // Optimize database
        await this._optimizeDatabase();
        
        logger.info('Cleanup tasks completed');
      } catch (error) {
        logger.error('Error in cleanup tasks:', error);
      }
    });

    this.jobs.set('cleanup', job);
    logger.info('Scheduled cleanup: daily at 3 AM');
  }

  async _cleanOldTestItems() {
    // Implementation would clean test items older than 7 days
    logger.info('Cleaning old test items...');
  }

  async _archiveOldInteractions() {
    // Implementation would archive interactions older than 30 days
    logger.info('Archiving old interactions...');
  }

  async _optimizeDatabase() {
    // Implementation would run database optimization
    logger.info('Optimizing database...');
  }

  // Dynamic job management
  addJob(name, cronExpression, handler) {
    if (this.jobs.has(name)) {
      logger.warn(`Job ${name} already exists. Removing old job.`);
      this.removeJob(name);
    }

    const job = cron.schedule(cronExpression, handler);
    this.jobs.set(name, job);
    logger.info(`Added job: ${name} with expression: ${cronExpression}`);
  }

  removeJob(name) {
    const job = this.jobs.get(name);
    if (job) {
      job.stop();
      this.jobs.delete(name);
      logger.info(`Removed job: ${name}`);
    }
  }

  // Utility methods for time-based posting
  getOptimalPostingTimes() {
    // Based on engagement data, return optimal posting times
    // This is a simplified version - real implementation would analyze historical data
    return [
      { hour: 9, minute: 0 },   // 9 AM
      { hour: 12, minute: 30 }, // 12:30 PM
      { hour: 17, minute: 0 },  // 5 PM
      { hour: 20, minute: 0 }   // 8 PM
    ];
  }

  scheduleSpecificPost(content, date) {
    const now = new Date();
    const scheduledDate = new Date(date);
    
    if (scheduledDate <= now) {
      logger.error('Cannot schedule post in the past');
      return false;
    }

    // Calculate delay
    const delay = scheduledDate - now;
    
    setTimeout(async () => {
      try {
        await tweetController.postTweet(content);
      } catch (error) {
        logger.error('Error posting scheduled tweet:', error);
      }
    }, delay);

    logger.info(`Scheduled post for ${scheduledDate}`);
    return true;
  }
}

module.exports = new SchedulerService();