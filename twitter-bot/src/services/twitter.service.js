// src/services/twitter.service.js
const { TwitterApi } = require('twitter-api-v2');
const config = require('../../config');
const logger = require('../utils/logger');

class TwitterService {
  constructor() {
    this.client = new TwitterApi({
      appKey: config.twitter.apiKey,
      appSecret: config.twitter.apiSecret,
      accessToken: config.twitter.accessToken,
      accessSecret: config.twitter.accessSecret,
    });

    this.v2Client = this.client.v2;
    this.isTestMode = config.bot.enableAutoPosting === false;
  }

  async postTweet(content, options = {}) {
    try {
      if (this.isTestMode) {
        logger.info('TEST MODE: Would post tweet:', content);
        return {
          data: {
            id: `test_${Date.now()}`,
            text: content,
            created_at: new Date().toISOString()
          }
        };
      }

      const tweetData = { text: content };
      
      if (options.replyToId) {
        tweetData.reply = { in_reply_to_tweet_id: options.replyToId };
      }

      if (options.mediaIds && options.mediaIds.length > 0) {
        tweetData.media = { media_ids: options.mediaIds };
      }

      const result = await this.v2Client.tweet(tweetData);
      logger.info('Tweet posted successfully:', result.data.id);
      return result;
    } catch (error) {
      logger.error('Error posting tweet:', error);
      throw error;
    }
  }

  async deleteTweet(tweetId) {
    try {
      if (this.isTestMode) {
        logger.info('TEST MODE: Would delete tweet:', tweetId);
        return { data: { deleted: true } };
      }

      const result = await this.v2Client.deleteTweet(tweetId);
      logger.info('Tweet deleted successfully:', tweetId);
      return result;
    } catch (error) {
      logger.error('Error deleting tweet:', error);
      throw error;
    }
  }

  async getMentions(sinceId = null) {
    try {
      const params = {
        'tweet.fields': ['created_at', 'conversation_id', 'in_reply_to_user_id', 'referenced_tweets'],
        'user.fields': ['username', 'verified'],
        max_results: 100
      };

      if (sinceId) {
        params.since_id = sinceId;
      }

      const mentions = await this.v2Client.userMentionTimeline(
        await this.getUserId(),
        params
      );

      return mentions.data || [];
    } catch (error) {
      logger.error('Error getting mentions:', error);
      throw error;
    }
  }

  async getTweet(tweetId) {
    try {
      const tweet = await this.v2Client.singleTweet(tweetId, {
        'tweet.fields': ['created_at', 'conversation_id', 'in_reply_to_user_id', 'referenced_tweets', 'author_id'],
        'user.fields': ['username', 'verified'],
        expansions: ['author_id']
      });

      return tweet.data;
    } catch (error) {
      logger.error('Error getting tweet:', error);
      throw error;
    }
  }

  async getConversation(conversationId) {
    try {
      const conversation = await this.v2Client.search(`conversation_id:${conversationId}`, {
        'tweet.fields': ['created_at', 'conversation_id', 'in_reply_to_user_id', 'referenced_tweets'],
        'user.fields': ['username'],
        max_results: 100,
        sort_order: 'recency'
      });

      return conversation.data || [];
    } catch (error) {
      logger.error('Error getting conversation:', error);
      throw error;
    }
  }

  async getUserTimeline(userId, maxResults = 100) {
    try {
      const timeline = await this.v2Client.userTimeline(userId, {
        'tweet.fields': ['created_at', 'public_metrics'],
        max_results,
        exclude: ['retweets', 'replies']
      });

      return timeline.data || [];
    } catch (error) {
      logger.error('Error getting user timeline:', error);
      throw error;
    }
  }

  async searchTweets(query, maxResults = 100) {
    try {
      const results = await this.v2Client.search(query, {
        'tweet.fields': ['created_at', 'author_id', 'public_metrics'],
        'user.fields': ['username', 'verified'],
        max_results,
        sort_order: 'relevancy'
      });

      return results.data || [];
    } catch (error) {
      logger.error('Error searching tweets:', error);
      throw error;
    }
  }

  async getUserId() {
    try {
      if (this._userId) return this._userId;

      const me = await this.v2Client.me();
      this._userId = me.data.id;
      return this._userId;
    } catch (error) {
      logger.error('Error getting user ID:', error);
      throw error;
    }
  }

  async uploadMedia(mediaBuffer, mediaType) {
    try {
      if (this.isTestMode) {
        logger.info('TEST MODE: Would upload media');
        return `test_media_${Date.now()}`;
      }

      const mediaId = await this.client.v1.uploadMedia(mediaBuffer, { type: mediaType });
      return mediaId;
    } catch (error) {
      logger.error('Error uploading media:', error);
      throw error;
    }
  }

  async followUser(userId) {
    try {
      if (this.isTestMode) {
        logger.info('TEST MODE: Would follow user:', userId);
        return { data: { following: true } };
      }

      const result = await this.v2Client.follow(await this.getUserId(), userId);
      logger.info('Followed user:', userId);
      return result;
    } catch (error) {
      logger.error('Error following user:', error);
      throw error;
    }
  }

  async likeTwitter(tweetId) {
    try {
      if (this.isTestMode) {
        logger.info('TEST MODE: Would like tweet:', tweetId);
        return { data: { liked: true } };
      }

      const result = await this.v2Client.like(await this.getUserId(), tweetId);
      logger.info('Liked tweet:', tweetId);
      return result;
    } catch (error) {
      logger.error('Error liking tweet:', error);
      throw error;
    }
  }

  async retweet(tweetId) {
    try {
      if (this.isTestMode) {
        logger.info('TEST MODE: Would retweet:', tweetId);
        return { data: { retweeted: true } };
      }

      const result = await this.v2Client.retweet(await this.getUserId(), tweetId);
      logger.info('Retweeted:', tweetId);
      return result;
    } catch (error) {
      logger.error('Error retweeting:', error);
      throw error;
    }
  }

  // Rate limit handling
  getRateLimitInfo() {
    return this.client.rateLimit;
  }

  async waitForRateLimit() {
    const rateLimit = this.getRateLimitInfo();
    if (rateLimit && rateLimit.remaining === 0) {
      const resetTime = new Date(rateLimit.reset * 1000);
      const waitTime = resetTime - new Date();
      
      if (waitTime > 0) {
        logger.info(`Rate limit hit. Waiting ${waitTime / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
}

module.exports = new TwitterService();