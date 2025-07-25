// src/test-mode/simulator.js
const logger = require('../utils/logger');
const aiService = require('../services/ai.service');
const tweetController = require('../controllers/tweet.controller');
const responseController = require('../controllers/response.controller');

class Simulator {
  constructor() {
    this.mockTweets = [
      {
        id: 'mock_1',
        text: 'Hey @testbot, what do you think about AI?',
        author_id: 'user_1',
        author_username: 'tech_enthusiast',
        conversation_id: 'conv_1',
        created_at: new Date().toISOString()
      },
      {
        id: 'mock_2',
        text: 'Just launched my new startup! Thoughts?',
        author_id: 'user_2',
        author_username: 'startup_founder',
        conversation_id: 'conv_2',
        created_at: new Date().toISOString()
      }
    ];
  }

  async runDailySimulation() {
    logger.info('Starting daily simulation...');
    
    try {
      // Simulate scheduled tweets
      const hours = [9, 12, 17, 20];
      for (const hour of hours) {
        await this.simulateScheduledTweet(hour);
      }

      // Simulate mentions and replies
      await this.simulateMentions();

      // Generate summary
      const summary = await this.generateSimulationSummary();
      
      logger.info('Daily simulation complete:', summary);
      return summary;
    } catch (error) {
      logger.error('Error in daily simulation:', error);
      throw error;
    }
  }

  async simulateScheduledTweet(hour) {
    logger.info(`Simulating scheduled tweet for ${hour}:00`);
    
    const context = {
      type: 'scheduled',
      time: `${hour}:00`,
      dayOfWeek: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
      timeOfDay: hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
    };

    const tweet = await aiService.generateTweet(context);
    const analysis = await aiService.analyzeContent(tweet.content);
    
    await this._saveSimulationResult({
      type: 'scheduled_tweet',
      hour,
      tweet,
      analysis
    });

    return { tweet, analysis };
  }

  async simulateMentions() {
    logger.info('Simulating mention responses...');
    
    for (const mockTweet of this.mockTweets) {
      const shouldReply = await aiService.shouldReplyToTweet(mockTweet);
      
      if (shouldReply.should_reply) {
        const reply = await aiService.generateReply(mockTweet);
        const analysis = await aiService.analyzeContent(reply.content);
        
        await this._saveSimulationResult({
          type: 'reply',
          originalTweet: mockTweet,
          reply,
          analysis
        });
      }
    }
  }

  async simulateWeek() {
    logger.info('Starting week-long simulation...');
    
    const results = [];
    for (let day = 0; day < 7; day++) {
      const dayResult = await this.runDailySimulation();
      results.push({
        day: day + 1,
        ...dayResult
      });
      
      // Small delay between days
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return results;
  }

  async testPersonalityConsistency(sampleSize = 10) {
    logger.info(`Testing personality consistency with ${sampleSize} samples...`);
    
    const tweets = [];
    for (let i = 0; i < sampleSize; i++) {
      const tweet = await aiService.generateTweet({ type: 'random' });
      const analysis = await aiService.analyzeContent(tweet.content);
      tweets.push({ tweet, analysis });
    }

    // Calculate consistency metrics
    const metrics = this._calculateConsistencyMetrics(tweets);
    
    return {
      tweets,
      metrics
    };
  }

  _calculateConsistencyMetrics(tweets) {
    const sentiments = tweets.map(t => t.analysis.sentiment);
    const stylescores = tweets.map(t => t.analysis.style_match);
    
    return {
      avgSentiment: this._average(sentiments),
      sentimentVariance: this._variance(sentiments),
      avgStyleMatch: this._average(stylescores),
      styleMatchVariance: this._variance(stylescores),
      topicConsistency: this._calculateTopicConsistency(tweets)
    };
  }

  _average(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  _variance(arr) {
    const avg = this._average(arr);
    const squareDiffs = arr.map(value => Math.pow(value - avg, 2));
    return this._average(squareDiffs);
  }

  _calculateTopicConsistency(tweets) {
    const allTopics = new Set();
    tweets.forEach(t => {
      (t.analysis.topics || []).forEach(topic => allTopics.add(topic));
    });
    
    const topicCounts = {};
    allTopics.forEach(topic => {
      topicCounts[topic] = tweets.filter(t => 
        (t.analysis.topics || []).includes(topic)
      ).length;
    });
    
    return topicCounts;
  }

  async _saveSimulationResult(result) {
    // In a real implementation, save to database
    logger.debug('Simulation result:', result);
  }

  async generateSimulationSummary() {
    // Generate summary of simulation results
    return {
      totalTweets: 4,
      totalReplies: this.mockTweets.length,
      avgEngagementPrediction: 'medium',
      avgRiskScore: 15,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = new Simulator();

// src/test-mode/dashboard.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('../../config');
const logger = require('../utils/logger');
const tweetController = require('../controllers/tweet.controller');
const supabaseService = require('../services/supabase.service');
const simulator = require('./simulator');
const aiService = require('../services/ai.service');

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Routes
app.get('/api/test-queue', async (req, res) => {
  try {
    const queue = await tweetController.getTestQueue();
    res.json(queue);
  } catch (error) {
    logger.error('Error getting test queue:', error);
    res.status(500).json({ error: 'Failed to get test queue' });
  }
});

app.post('/api/test-queue/:id/approve', async (req, res) => {
  try {
    const result = await tweetController.approveTestTweet(req.params.id);
    res.json(result);
  } catch (error) {
    logger.error('Error approving tweet:', error);
    res.status(500).json({ error: 'Failed to approve tweet' });
  }
});

app.post('/api/test-queue/:id/reject', async (req, res) => {
  try {
    const result = await tweetController.rejectTestTweet(req.params.id);
    res.json(result);
  } catch (error) {
    logger.error('Error rejecting tweet:', error);
    res.status(500).json({ error: 'Failed to reject tweet' });
  }
});

app.put('/api/test-queue/:id', async (req, res) => {
  try {
    const { content } = req.body;
    const result = await tweetController.editTestTweet(req.params.id, content);
    res.json(result);
  } catch (error) {
    logger.error('Error editing tweet:', error);
    res.status(500).json({ error: 'Failed to edit tweet' });
  }
});

app.post('/api/generate-tweet', async (req, res) => {
  try {
    const { context } = req.body;
    const tweet = await aiService.generateTweet(context || {});
    const analysis = await aiService.analyzeContent(tweet.content);
    res.json({ tweet, analysis });
  } catch (error) {
    logger.error('Error generating tweet:', error);
    res.status(500).json({ error: 'Failed to generate tweet' });
  }
});

app.post('/api/analyze-content', async (req, res) => {
  try {
    const { content } = req.body;
    const analysis = await aiService.analyzeContent(content);
    res.json(analysis);
  } catch (error) {
    logger.error('Error analyzing content:', error);
    res.status(500).json({ error: 'Failed to analyze content' });
  }
});

app.post('/api/simulate/day', async (req, res) => {
  try {
    const result = await simulator.runDailySimulation();
    res.json(result);
  } catch (error) {
    logger.error('Error running simulation:', error);
    res.status(500).json({ error: 'Failed to run simulation' });
  }
});

app.post('/api/simulate/week', async (req, res) => {
  try {
    const result = await simulator.simulateWeek();
    res.json(result);
  } catch (error) {
    logger.error('Error running week simulation:', error);
    res.status(500).json({ error: 'Failed to run week simulation' });
  }
});

app.get('/api/personality-config', async (req, res) => {
  try {
    const config = await supabaseService.getPersonalityConfig();
    res.json(config);
  } catch (error) {
    logger.error('Error getting personality config:', error);
    res.status(500).json({ error: 'Failed to get personality config' });
  }
});

app.put('/api/personality-config', async (req, res) => {
  try {
    const result = await supabaseService.updatePersonalityConfig(req.body);
    res.json(result);
  } catch (error) {
    logger.error('Error updating personality config:', error);
    res.status(500).json({ error: 'Failed to update personality config' });
  }
});

app.get('/api/analytics', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const interactions = await supabaseService.getRecentInteractions(hours);
    
    const analytics = {
      totalTweets: interactions.filter(i => i.type === 'tweet_posted').length,
      totalReplies: interactions.filter(i => i.type === 'reply_posted').length,
      totalSkipped: interactions.filter(i => i.type === 'mention_skipped').length,
      interactions: interactions
    };
    
    res.json(analytics);
  } catch (error) {
    logger.error('Error getting analytics:', error);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

// Start server
const port = config.server.dashboardPort;
app.listen(port, () => {
  logger.info(`Test dashboard running on port ${port}`);
  console.log(`Dashboard available at http://localhost:${port}`);
});