// src/test-mode/dashboard.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('../../config');
const logger = require('../utils/logger');
const supabaseService = require('../services/supabase.service');
const aiService = require('../services/ai.service');
const tweetController = require('../controllers/tweet.controller');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/index.html'));
});

// API Routes

// Get test queue
app.get('/api/test-queue', async (req, res) => {
  try {
    const queue = await supabaseService.getTestQueue();
    res.json(queue);
  } catch (error) {
    logger.error('Error getting test queue:', error);
    res.status(500).json({ error: 'Failed to get test queue' });
  }
});

// Generate new tweet
app.post('/api/generate-tweet', async (req, res) => {
  try {
    const { context } = req.body;
    const tweet = await aiService.generateTweet(context || {});
    
    // Add to test queue
    await supabaseService.saveToTestQueue(tweet.content, {
      ...tweet.metadata,
      analysis: {
        sentiment: 'positive',
        style_match: 85,
        risk_score: 10,
        engagement_prediction: 'medium'
      }
    });
    
    res.json({
      tweet,
      analysis: {
        sentiment: 'positive',
        style_match: 85,
        risk_score: 10,
        engagement_prediction: 'medium'
      }
    });
  } catch (error) {
    logger.error('Error generating tweet:', error);
    res.status(500).json({ error: 'Failed to generate tweet' });
  }
});

// Approve tweet
app.post('/api/test-queue/:id/approve', async (req, res) => {
  try {
    await supabaseService.updateTestStatus(req.params.id, 'approved');
    res.json({ success: true });
  } catch (error) {
    logger.error('Error approving tweet:', error);
    res.status(500).json({ error: 'Failed to approve tweet' });
  }
});

// Reject tweet
app.post('/api/test-queue/:id/reject', async (req, res) => {
  try {
    await supabaseService.updateTestStatus(req.params.id, 'rejected');
    res.json({ success: true });
  } catch (error) {
    logger.error('Error rejecting tweet:', error);
    res.status(500).json({ error: 'Failed to reject tweet' });
  }
});

// Edit tweet
app.put('/api/test-queue/:id', async (req, res) => {
  try {
    const { content } = req.body;
    await supabaseService.updateTestContent(req.params.id, content);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error editing tweet:', error);
    res.status(500).json({ error: 'Failed to edit tweet' });
  }
});

// Get analytics
app.get('/api/analytics', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const interactions = await supabaseService.getRecentInteractions(hours);
    
    const analytics = {
      totalTweets: interactions.filter(i => i.type === 'tweet_posted').length,
      totalReplies: interactions.filter(i => i.type === 'reply_posted').length,
      totalSkipped: interactions.filter(i => i.type === 'mention_skipped').length
    };
    
    res.json(analytics);
  } catch (error) {
    logger.error('Error getting analytics:', error);
    res.json({ totalTweets: 0, totalReplies: 0, totalSkipped: 0 });
  }
});

// Get personality config
app.get('/api/personality-config', async (req, res) => {
  try {
    const config = await supabaseService.getPersonalityConfig();
    res.json(config);
  } catch (error) {
    logger.error('Error getting personality config:', error);
    res.json({});
  }
});

// Update personality config
app.put('/api/personality-config', async (req, res) => {
  try {
    const result = await supabaseService.updatePersonalityConfig(req.body);
    res.json(result);
  } catch (error) {
    logger.error('Error updating personality config:', error);
    res.status(500).json({ error: 'Failed to update personality config' });
  }
});

// Simulation endpoints
app.post('/api/simulate/day', async (req, res) => {
  try {
    res.json({
      totalTweets: 4,
      totalReplies: 2,
      avgEngagementPrediction: 'medium',
      avgRiskScore: 15,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error running day simulation:', error);
    res.status(500).json({ error: 'Failed to run simulation' });
  }
});

app.post('/api/simulate/week', async (req, res) => {
  try {
    const results = [];
    for (let i = 1; i <= 7; i++) {
      results.push({
        day: i,
        totalTweets: Math.floor(Math.random() * 5) + 1,
        totalReplies: Math.floor(Math.random() * 3)
      });
    }
    res.json(results);
  } catch (error) {
    logger.error('Error running week simulation:', error);
    res.status(500).json({ error: 'Failed to run week simulation' });
  }
});

// Add these endpoints to your src/test-mode/dashboard.js file

// Load persona from JSON file
app.post('/api/load-persona', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    // Read persona.json
    const personaPath = path.join(__dirname, '../../persona.json');
    
    if (!fs.existsSync(personaPath)) {
      return res.status(404).json({ error: 'persona.json not found' });
    }
    
    const personaData = JSON.parse(fs.readFileSync(personaPath, 'utf8'));
    
    // Prepare config
    const dbConfig = {
      name: personaData.name,
      bio: personaData.bio,
      interests: personaData.interests,
      writing_style: personaData.personality.writing_style,
      tone: personaData.personality.tone,
      topics: [...personaData.topics.primary, ...personaData.topics.secondary],
      avoid_topics: personaData.avoid_topics,
      quirks: personaData.quirks,
      metadata: personaData
    };
    
    // Use the fixed update method
    await supabaseService.updatePersonalityConfig(dbConfig);
    
    // Add example tweets
    if (personaData.example_tweets) {
      for (const tweet of personaData.example_tweets) {
        try {
          await supabaseService.client
            .from('training_tweets')
            .insert({
              text: tweet,
              is_approved: true,
              created_at: new Date().toISOString()
            });
        } catch (err) {
          // Ignore duplicates
        }
      }
    }
    
    // Reinitialize AI service to load new config
    await aiService.initialize();
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Error loading persona:', error);
    res.status(500).json({ error: 'Failed to load persona' });
  }
});

// Import tweets from Twitter
app.post('/api/import-tweets', async (req, res) => {
  try {
    const twitterService = require('../services/twitter.service');
    
    // Get user ID
    const userId = await twitterService.getUserId();
    
    // Fetch recent tweets
    const tweets = await twitterService.getUserTimeline(userId, 50);
    
    let imported = 0;
    for (const tweet of tweets) {
      try {
        await supabaseService.client
          .from('training_tweets')
          .insert({
            twitter_id: tweet.id,
            text: tweet.text,
            created_at: tweet.created_at,
            is_approved: true
          });
        imported++;
      } catch (err) {
        // Skip duplicates
      }
    }
    
    res.json({ success: true, count: imported });
  } catch (error) {
    logger.error('Error importing tweets:', error);
    res.status(500).json({ error: 'Failed to import tweets' });
  }
});

// Start server
const port = config.server.dashboardPort;
app.listen(port, () => {
  logger.info(`Test dashboard running on port ${port}`);
  console.log(`
  ✅ Dashboard is running!
  🌐 Open http://localhost:${port} in your browser
  `);
});