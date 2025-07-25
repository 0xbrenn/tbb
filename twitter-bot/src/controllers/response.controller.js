// src/controllers/response.controller.js
const config = require('../../config');
const logger = require('../utils/logger');
const twitterService = require('../services/twitter.service');
const aiService = require('../services/ai.service');
const supabaseService = require('../services/supabase.service');
const contentFilter = require('../utils/content-filter');

class ResponseController {
  constructor() {
    this.lastMentionId = null;
    this.replyCount = 0;
    this.lastReplyReset = new Date();
  }
async checkAndReplyToMentions() {
    try {
      // Skip Twitter API calls if in test mode or if credentials are invalid
      if (config.bot.enableAutoPosting === false) {
        logger.info('Skipping mention check in test mode');
        return;
      }

      // Your existing mention checking code...
    } catch (error) {
      logger.error('Error checking mentions:', error);
    }
  }

  async _processMention(mention) {
    try {
      // Skip if it's our own tweet
      const ourUserId = await twitterService.getUserId();
      if (mention.author_id === ourUserId) {
        return;
      }

      // Check if we've already replied to this mention
      const existingReply = await this._checkExistingReply(mention.id);
      if (existingReply) {
        logger.info(`Already replied to mention ${mention.id}`);
        return;
      }

      // Get conversation context
      const conversationContext = await this._getConversationContext(mention);

      // Determine if we should reply
      const shouldReply = await aiService.shouldReplyToTweet(mention);
      
      if (!shouldReply.should_reply) {
        logger.info(`Skipping mention ${mention.id}: ${shouldReply.reason}`);
        await this._logSkippedMention(mention, shouldReply.reason);
        return;
      }

      // Generate reply
      const reply = await aiService.generateReply(mention, conversationContext);

      // Content filtering
      const filtered = await contentFilter.checkContent(reply.content);
      if (!filtered.safe) {
        logger.warn(`Reply failed content filter: ${filtered.reason}`);
        await this._logSkippedMention(mention, 'Failed content filter');
        return;
      }

      // Post reply based on mode
      if (config.bot.enableAutoPosting) {
        await this._postReply(mention, reply);
      } else {
        await this._addReplyToTestQueue(mention, reply);
      }

      this.replyCount++;
    } catch (error) {
      logger.error(`Error processing mention ${mention.id}:`, error);
      throw error;
    }
  }

  async _postReply(mention, reply) {
    try {
      const result = await twitterService.postTweet(reply.content, {
        replyToId: mention.id,
        metadata: reply.metadata
      });

      // Save to conversations
      await supabaseService.saveConversation({
        conversation_id: mention.conversation_id,
        tweet_id: result.data.id,
        in_reply_to: mention.id,
        content: reply.content,
        author_id: await twitterService.getUserId(),
        created_at: new Date().toISOString()
      });

      // Log interaction
      await supabaseService.logInteraction({
        type: 'reply_posted',
        twitter_id: result.data.id,
        in_reply_to: mention.id,
        content: reply.content,
        created_at: new Date().toISOString()
      });

      logger.info(`Posted reply to mention ${mention.id}`);
      return result;
    } catch (error) {
      logger.error('Error posting reply:', error);
      throw error;
    }
  }

  async _addReplyToTestQueue(mention, reply) {
    try {
      await supabaseService.saveToTestQueue(reply.content, {
        ...reply.metadata,
        type: 'reply',
        in_reply_to: mention.id,
        original_tweet: mention.text,
        author: mention.author_username
      });

      logger.info(`Added reply to test queue for mention ${mention.id}`);
    } catch (error) {
      logger.error('Error adding reply to test queue:', error);
      throw error;
    }
  }

  async _getConversationContext(mention) {
    try {
      if (!mention.conversation_id) {
        return [];
      }

      // Get conversation from database first
      let conversation = await supabaseService.getConversationContext(mention.conversation_id);
      
      // If not in database or incomplete, fetch from Twitter
      if (!conversation || conversation.length < 3) {
        const twitterConversation = await twitterService.getConversation(mention.conversation_id);
        
        // Save to database for future use
        for (const tweet of twitterConversation) {
          if (!conversation.find(c => c.tweet_id === tweet.id)) {
            await supabaseService.saveConversation({
              conversation_id: mention.conversation_id,
              tweet_id: tweet.id,
              content: tweet.text,
              author_id: tweet.author_id,
              created_at: tweet.created_at
            });
          }
        }
        
        conversation = twitterConversation;
      }

      // Return last 5 tweets for context
      return conversation.slice(-5);
    } catch (error) {
      logger.error('Error getting conversation context:', error);
      return [];
    }
  }

  async _checkExistingReply(mentionId) {
    try {
      const interactions = await supabaseService.getRecentInteractions(24);
      return interactions.find(i => 
        i.type === 'reply_posted' && 
        i.in_reply_to === mentionId
      );
    } catch (error) {
      logger.error('Error checking existing reply:', error);
      return false;
    }
  }

  _checkReplyRateLimit() {
    const now = new Date();
    const hoursSinceReset = (now - this.lastReplyReset) / (1000 * 60 * 60);
    
    if (hoursSinceReset >= 1) {
      // Reset counter
      this.replyCount = 0;
      this.lastReplyReset = now;
    }

    return this.replyCount < config.bot.maxRepliesPerHour;
  }

  async _logSkippedMention(mention, reason) {
    try {
      await supabaseService.logInteraction({
        type: 'mention_skipped',
        twitter_id: mention.id,
        reason: reason,
        content: mention.text,
        author: mention.author_username,
        created_at: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error logging skipped mention:', error);
    }
  }

  // Advanced response features
  async handleDirectMessage(dm) {
    try {
      logger.info('Processing direct message:', dm.id);
      
      // Generate response
      const response = await aiService.generateReply({
        text: dm.text,
        author_username: dm.sender_username,
        conversation_id: dm.conversation_id
      });

      // In test mode, add to queue instead of sending
      if (!config.bot.enableAutoPosting) {
        return await supabaseService.saveToTestQueue(response.content, {
          type: 'dm_reply',
          dm_id: dm.id,
          sender: dm.sender_username
        });
      }

      // Send DM reply
      // Note: Twitter API v2 DM endpoints would be used here
      logger.info('DM reply would be sent here');
    } catch (error) {
      logger.error('Error handling direct message:', error);
      throw error;
    }
  }

  async engageWithTrending(topic) {
    try {
      logger.info('Engaging with trending topic:', topic);
      
      // Search for relevant tweets
      const tweets = await twitterService.searchTweets(topic, 10);
      
      // Filter for high-quality tweets to engage with
      const qualityTweets = tweets.filter(tweet => {
        const metrics = tweet.public_metrics || {};
        return metrics.like_count > 100 || metrics.retweet_count > 50;
      });

      for (const tweet of qualityTweets.slice(0, 3)) {
        const shouldEngage = await aiService.shouldReplyToTweet(tweet);
        
        if (shouldEngage.should_reply) {
          const reply = await aiService.generateReply(tweet);
          
          if (config.bot.enableAutoPosting) {
            await this._postReply(tweet, reply);
          } else {
            await this._addReplyToTestQueue(tweet, reply);
          }
        }
      }
    } catch (error) {
      logger.error('Error engaging with trending topic:', error);
      throw error;
    }
  }

  async monitorKeywords(keywords) {
    try {
      for (const keyword of keywords) {
        const tweets = await twitterService.searchTweets(keyword, 20);
        
        for (const tweet of tweets) {
          // Skip if we've already interacted
          const hasInteracted = await this._hasInteractedWith(tweet.id);
          if (hasInteracted) continue;

          // Analyze if we should engage
          const shouldEngage = await aiService.shouldReplyToTweet(tweet);
          
          if (shouldEngage.should_reply) {
            await this._processMention(tweet);
          }
        }
      }
    } catch (error) {
      logger.error('Error monitoring keywords:', error);
      throw error;
    }
  }

  async _hasInteractedWith(tweetId) {
    const interactions = await supabaseService.getRecentInteractions(168); // 7 days
    return interactions.some(i => 
      i.twitter_id === tweetId || i.in_reply_to === tweetId
    );
  }
}

module.exports = new ResponseController();