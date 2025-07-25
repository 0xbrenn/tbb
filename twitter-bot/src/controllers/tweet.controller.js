// src/controllers/tweet.controller.js
const config = require('../../config');
const logger = require('../utils/logger');
const twitterService = require('../services/twitter.service');
const aiService = require('../services/ai.service');
const supabaseService = require('../services/supabase.service');
const contentFilter = require('../utils/content-filter');
const personality = require('../utils/personality');

class TweetController {
  async generateScheduledTweet() {
    try {
      logger.info('Generating scheduled tweet...');

      // Get context for the tweet
      const context = await this._getTweetContext();

      // Generate tweet content
      const generated = await aiService.generateTweet(context);

      // Apply content filtering
      const filtered = await contentFilter.checkContent(generated.content);
      if (!filtered.safe) {
        logger.warn('Generated tweet failed content filter:', filtered.reason);
        return null;
      }

      // Analyze the content
      const analysis = await aiService.analyzeContent(generated.content);

      // Add to test queue or scheduled posts based on mode
      if (config.bot.enableAutoPosting) {
        return await this._schedulePost(generated, analysis);
      } else {
        return await this._addToTestQueue(generated, analysis);
      }
    } catch (error) {
      logger.error('Error generating scheduled tweet:', error);
      throw error;
    }
  }

  async postTweet(content, options = {}) {
    try {
      logger.info('Posting tweet:', content);

      // Final content check
      const filtered = await contentFilter.checkContent(content);
      if (!filtered.safe) {
        logger.error('Tweet failed final content filter:', filtered.reason);
        throw new Error('Content failed safety check');
      }

      // Post to Twitter
      const result = await twitterService.postTweet(content, options);

      // Save to database
      await supabaseService.saveTweet({
        twitter_id: result.data.id,
        content: content,
        posted_at: new Date().toISOString(),
        metrics: {
          initial: {
            likes: 0,
            retweets: 0,
            replies: 0
          }
        },
        metadata: options.metadata || {}
      });

      // Log interaction
      await supabaseService.logInteraction({
        type: 'tweet_posted',
        twitter_id: result.data.id,
        content: content,
        created_at: new Date().toISOString()
      });

      return result;
    } catch (error) {
      logger.error('Error posting tweet:', error);
      throw error;
    }
  }

  async processScheduledPosts() {
    try {
      const posts = await supabaseService.getScheduledTweets();
      
      for (const post of posts) {
        try {
          // Check rate limits
          const canPost = await this._checkRateLimits();
          if (!canPost) {
            logger.info('Rate limit reached, skipping scheduled posts');
            break;
          }

          // Post the tweet
          const result = await this.postTweet(post.content, {
            metadata: post.metadata
          });

          // Update status
          await supabaseService.updateTweetStatus(
            post.id,
            'posted',
            result.data.id
          );

        } catch (error) {
          logger.error(`Error posting scheduled tweet ${post.id}:`, error);
          await supabaseService.updateTweetStatus(post.id, 'failed');
        }
      }
    } catch (error) {
      logger.error('Error processing scheduled posts:', error);
    }
  }

  async createThread(tweets) {
    try {
      logger.info('Creating thread with', tweets.length, 'tweets');
      
      let previousTweetId = null;
      const postedTweets = [];

      for (const tweet of tweets) {
        const options = previousTweetId ? { replyToId: previousTweetId } : {};
        
        const result = await this.postTweet(tweet, options);
        postedTweets.push(result);
        
        previousTweetId = result.data.id;
        
        // Small delay between tweets in thread
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      return postedTweets;
    } catch (error) {
      logger.error('Error creating thread:', error);
      throw error;
    }
  }

  async _getTweetContext() {
    try {
      // Get current trending topics
      const trending = await this._getTrendingTopics();
      
      // Get recent interactions
      const recentInteractions = await supabaseService.getRecentInteractions(24);
      
      // Get user's recent tweets to avoid repetition
      const recentTweets = await supabaseService.getScheduledTweets();
      
      // Build context
      const context = {
        type: 'scheduled',
        time: new Date().toISOString(),
        dayOfWeek: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
        timeOfDay: this._getTimeOfDay(),
        trending: trending,
        recentTopics: this._extractTopics(recentTweets),
        engagement: {
          high: recentInteractions.filter(i => i.type === 'high_engagement'),
          low: recentInteractions.filter(i => i.type === 'low_engagement')
        }
      };

      return context;
    } catch (error) {
      logger.error('Error getting tweet context:', error);
      return { type: 'random' };
    }
  }

  async _getTrendingTopics() {
    // In a real implementation, this would fetch from Twitter API
    // For now, return mock data
    return [
      { name: '#Tech', tweet_volume: 50000 },
      { name: '#AI', tweet_volume: 30000 }
    ];
  }

  _getTimeOfDay() {
    const hour = new Date().getHours();
    if (hour < 6) return 'late_night';
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    if (hour < 21) return 'evening';
    return 'night';
  }

  _extractTopics(tweets) {
    // Extract hashtags and common words from recent tweets
    const topics = new Set();
    
    tweets.forEach(tweet => {
      // Extract hashtags
      const hashtags = tweet.content.match(/#\w+/g) || [];
      hashtags.forEach(tag => topics.add(tag));
      
      // Extract mentioned users
      const mentions = tweet.content.match(/@\w+/g) || [];
      mentions.forEach(mention => topics.add(mention));
    });

    return Array.from(topics);
  }

  async _schedulePost(generated, analysis) {
    const scheduledTime = this._getNextOptimalTime();
    
    return await supabaseService.saveTweet({
      content: generated.content,
      scheduled_time: scheduledTime,
      status: 'pending',
      metadata: {
        ...generated.metadata,
        analysis
      }
    });
  }

  async _addToTestQueue(generated, analysis) {
    return await supabaseService.saveToTestQueue(generated.content, {
      ...generated.metadata,
      analysis,
      suggested_time: this._getNextOptimalTime()
    });
  }

  _getNextOptimalTime() {
    // Get optimal posting times from scheduler
    const optimalTimes = [
      { hour: 9, minute: 0 },
      { hour: 12, minute: 30 },
      { hour: 17, minute: 0 },
      { hour: 20, minute: 0 }
    ];

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Find next optimal time
    for (const time of optimalTimes) {
      if (time.hour > currentHour || 
          (time.hour === currentHour && time.minute > currentMinute)) {
        const nextTime = new Date();
        nextTime.setHours(time.hour, time.minute, 0, 0);
        return nextTime;
      }
    }

    // If no time today, use first time tomorrow
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(optimalTimes[0].hour, optimalTimes[0].minute, 0, 0);
    return tomorrow;
  }

  async _checkRateLimits() {
    try {
      // Check Twitter rate limits
      const rateLimitInfo = twitterService.getRateLimitInfo();
      if (rateLimitInfo && rateLimitInfo.remaining < 5) {
        logger.warn('Twitter rate limit low:', rateLimitInfo);
        return false;
      }

      // Check our own rate limits
      const recentTweets = await supabaseService.getRecentInteractions(1);
      const tweetsInLastHour = recentTweets.filter(i => i.type === 'tweet_posted').length;
      
      if (tweetsInLastHour >= 10) {
        logger.warn('Internal rate limit reached');
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error checking rate limits:', error);
      return true; // Allow posting if check fails
    }
  }

  // Test mode specific methods
  async getTestQueue() {
    try {
      return await supabaseService.getTestQueue();
    } catch (error) {
      logger.error('Error getting test queue:', error);
      throw error;
    }
  }

  async approveTestTweet(testId) {
    try {
      return await supabaseService.approveTestTweet(testId);
    } catch (error) {
      logger.error('Error approving test tweet:', error);
      throw error;
    }
  }

  async rejectTestTweet(testId) {
    try {
      return await supabaseService.updateTestStatus(testId, 'rejected');
    } catch (error) {
      logger.error('Error rejecting test tweet:', error);
      throw error;
    }
  }

  async editTestTweet(testId, newContent) {
    try {
      // Update content in test queue
      await supabaseService.updateTestTweet(testId, { content: newContent });
      
      // Re-analyze the edited content
      const analysis = await aiService.analyzeContent(newContent);
      
      return { success: true, analysis };
    } catch (error) {
      logger.error('Error editing test tweet:', error);
      throw error;
    }
  }
}

module.exports = new TweetController();