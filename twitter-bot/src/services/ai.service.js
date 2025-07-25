// src/services/ai.service.js
const Anthropic = require('@anthropic-ai/sdk');
const config = require('../../config');
const logger = require('../utils/logger');
const supabaseService = require('./supabase.service');

class AIService {
  constructor() {
    this.anthropic = new Anthropic({
      apiKey: config.ai.apiKey,
    });
    this.personalityConfig = null;
    this.trainingData = null;
    this.recentTopics = []; // Track recent topics to avoid repetition
  }

  async initialize() {
    try {
      // Load personality configuration
      this.personalityConfig = await supabaseService.getPersonalityConfig();
      
      // Load training data
      this.trainingData = await supabaseService.getTrainingTweets();
      
      logger.info('AI Service initialized with personality config and training data');
    } catch (error) {
      logger.error('Error initializing AI service:', error);
    }
  }

  async generateTweet(context = {}) {
    try {
      const prompt = await this._buildTweetPrompt(context);
      
      // Ensure prompt is a string
      const promptText = typeof prompt === 'string' ? prompt : String(prompt);
      
      console.log('Generating tweet with context:', context.type || 'random');
      
      const response = await this.anthropic.messages.create({
        model: config.ai.model,
        max_tokens: config.ai.maxTokens,
        temperature: 0.95, // Higher for more creativity
        top_p: 0.9, // Add variety
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: promptText
              }
            ]
          }
        ]
      });

      const tweetContent = response.content[0].text.trim();
      
      // Validate tweet length
      if (tweetContent.length > 280) {
        return await this._shortenTweet(tweetContent);
      }

      return {
        content: tweetContent,
        metadata: {
          ai_model: config.ai.model,
          context_type: context.type || 'random',
          generated_at: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error('Error generating tweet:', error);
      logger.error('Error details:', error.message);
      
      // Return a fallback tweet if AI fails
      return {
        content: "when your bot breaks while trying to tweet about bots breaking... meta debugging activated 🤖🔧",
        metadata: {
          error: true,
          error_message: error.message,
          context_type: context.type || 'random',
          generated_at: new Date().toISOString()
        }
      };
    }
  }

  async generateReply(tweet, conversationContext = []) {
    try {
      const prompt = this._buildReplyPrompt(tweet, conversationContext);
      
      const response = await this.anthropic.messages.create({
        model: config.ai.model,
        max_tokens: config.ai.maxTokens,
        temperature: 0.9,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              }
            ]
          }
        ]
      });

      const replyContent = response.content[0].text.trim();
      
      // Validate reply length
      if (replyContent.length > 280) {
        return await this._shortenTweet(replyContent);
      }

      return {
        content: replyContent,
        metadata: {
          ai_model: config.ai.model,
          reply_to: tweet.id,
          conversation_id: tweet.conversation_id,
          generated_at: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error('Error generating reply:', error);
      throw error;
    }
  }

  async analyzeContent(content) {
    try {
      const prompt = `
        Analyze the following tweet content and provide a JSON response with:
        1. sentiment: positive, negative, or neutral
        2. topics: array of main topics
        3. style_match: score 0-100 of how well it matches the user's style
        4. risk_score: 0-100 of potential controversy
        5. engagement_prediction: low, medium, or high
        
        Tweet: "${content}"
        
        Based on this personality profile:
        ${JSON.stringify(this.personalityConfig, null, 2)}
        
        Respond only with valid JSON.
      `;

      const response = await this.anthropic.messages.create({
        model: config.ai.model,
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              }
            ]
          }
        ]
      });

      try {
        return JSON.parse(response.content[0].text);
      } catch (parseError) {
        // Return default analysis if parsing fails
        return {
          sentiment: 'neutral',
          topics: ['general'],
          style_match: 75,
          risk_score: 10,
          engagement_prediction: 'medium'
        };
      }
    } catch (error) {
      logger.error('Error analyzing content:', error);
      // Return default analysis on error
      return {
        sentiment: 'neutral',
        topics: ['general'],
        style_match: 75,
        risk_score: 10,
        engagement_prediction: 'medium'
      };
    }
  }

  async _buildTweetPrompt(context) {
    const personalitySection = this._getPersonalitySection();
    const topicSuggestion = this._getRandomTopicSuggestion();
    const formatSuggestion = this._getRandomFormatSuggestion();
    const hashtagSuggestion = this._getHashtagSuggestion(topicSuggestion);
    const timePeriod = this._getTimePeriod();
    const examples = this._getVariedExamples();

    const prompt = `You are 0xBrenn, a real person on Twitter. Be authentically HUMAN.

WHO YOU ARE:
${personalitySection}

CURRENT MOMENT:
- Time: ${timePeriod}
- Mood: ${this._getRandomMood()}
- Topic on your mind: ${topicSuggestion}
- Communication style: ${formatSuggestion}

EXAMPLES OF YOUR VOICE (mix these styles, don't copy):
${examples}

TWEET REQUIREMENTS:
- Write about: ${topicSuggestion}
- Style: ${formatSuggestion}
- Include hashtags naturally at the end: ${hashtagSuggestion}
- Length: Under 280 chars including hashtags

BE HUMAN:
- React naturally to whatever's on your mind
- Use real emotions and reactions
- Sometimes incomplete thoughts are fine
- Mix technical and personal content
- Sound like you're talking to friends
- Be spontaneous and genuine

AVOID:
- Starting every tweet with "just"
- Sounding like a motivational poster
- Being overly technical constantly
- Repetitive patterns or formats
- Corporate/LinkedIn tone

Write ONE authentic tweet:`;

    return prompt;
  }

  _getTimePeriod() {
    const hour = new Date().getHours();
    if (hour < 6) return "late night/early morning vibes";
    if (hour < 9) return "morning coffee time";
    if (hour < 12) return "morning grind";
    if (hour < 14) return "lunch break thoughts";
    if (hour < 17) return "afternoon flow";
    if (hour < 20) return "evening wind down";
    return "night owl hours";
  }

  _getRandomMood() {
    const moods = [
      "thoughtful", "playful", "focused", "relaxed", "excited",
      "curious", "amused", "grateful", "determined", "chill",
      "energetic", "contemplative", "optimistic", "real", "vibing",
      "reflective", "inspired", "casual", "philosophical", "silly"
    ];
    return moods[Math.floor(Math.random() * moods.length)];
  }

  _getRandomEnergy() {
    const energy = [
      "coffee hasn't kicked in yet",
      "fully caffeinated",
      "in the zone",
      "winding down",
      "second wind",
      "peak productivity",
      "cozy mode",
      "ready to build",
      "taking it easy",
      "brain at 200%",
      "need more coffee",
      "feeling good"
    ];
    return energy[Math.floor(Math.random() * energy.length)];
  }

  _getHashtagSuggestion(topic) {
    // Much larger pool of hashtags organized by category
    const hashtagPool = {
      defi: [
        "#DeFi", "#DeFiDev", "#DeFiBuilder", "#Decentralized", "#DeFiProtocol",
        "#YieldFarming", "#LiquidityMining", "#AMM", "#DEX", "#DeFiSummer",
        "#BUIDL", "#DeFiCommunity", "#OpenFinance", "#MoneyLegos", "#Composability"
      ],
      web3: [
        "#Web3", "#Web3Dev", "#Web3Builder", "#Blockchain", "#Crypto",
        "#Decentralized", "#dApps", "#OnChain", "#Web3Community", "#CryptoTwitter",
        "#BlockchainDev", "#Ethereum", "#L2", "#CrossChain", "#MultiChain"
      ],
      ai: [
        "#AI", "#MachineLearning", "#DeepLearning", "#AIAgents", "#ML",
        "#ArtificialIntelligence", "#NeuralNetworks", "#AITwitter", "#MLOps",
        "#AIEngineering", "#DataScience", "#AGI", "#LLMs", "#AIBuilder"
      ],
      coding: [
        "#100DaysOfCode", "#CodeNewbie", "#Programming", "#Coding", "#DevLife",
        "#WebDev", "#FullStack", "#Backend", "#Frontend", "#CleanCode",
        "#CodeDaily", "#Developer", "#SoftwareEngineering", "#TechTwitter", "#DevCommunity"
      ],
      building: [
        "#BuildInPublic", "#ShipIt", "#IndieHacker", "#SideProject", "#Startup",
        "#Building", "#Shipping", "#Launch", "#MVP", "#ProductHunt",
        "#MakerLife", "#SoloFounder", "#Bootstrap", "#SaaS", "#Creating"
      ],
      learning: [
        "#LearnInPublic", "#TIL", "#Learning", "#Education", "#Knowledge",
        "#Growth", "#SkillUp", "#Study", "#Research", "#Discovery",
        "#Curious", "#AlwaysLearning", "#GrowthMindset", "#Insights", "#Wisdom"
      ],
      productivity: [
        "#Productivity", "#Efficiency", "#Workflow", "#Automation", "#Tools",
        "#LifeHacks", "#TimeManagement", "#Focus", "#GetThingsDone", "#Optimize",
        "#WorkSmart", "#ProductivityTips", "#Systems", "#Habits", "#Performance"
      ],
      community: [
        "#TechCommunity", "#DevRel", "#Community", "#OpenSource", "#OSS",
        "#Collaboration", "#TeamWork", "#Support", "#Together", "#Network",
        "#TechTwitter", "#DevTwitter", "#Connect", "#Share", "#Help"
      ],
      life: [
        "#Life", "#Thoughts", "#Random", "#DailyLife", "#Real",
        "#Mindset", "#Motivation", "#Inspiration", "#Vibes", "#Mood",
        "#Coffee", "#CoffeeLover", "#Weekend", "#Friday", "#Monday"
      ],
      trends: [
        "#FutureOfWork", "#Innovation", "#TechTrends", "#Emerging", "#NextGen",
        "#Future", "#Disruption", "#Revolution", "#Evolution", "#Progress",
        "#TechNews", "#Breakthrough", "#CuttingEdge", "#Tomorrow", "#Visionary"
      ]
    };

    // Smart category selection based on topic
    const primaryCategory = this._getCategoryFromTopic(topic);
    const allCategories = Object.keys(hashtagPool);
    
    // Remove primary from pool for secondary selection
    const secondaryCategories = allCategories.filter(cat => cat !== primaryCategory);
    const secondaryCategory = secondaryCategories[Math.floor(Math.random() * secondaryCategories.length)];
    
    // Get hashtags
    const primaryHashtags = hashtagPool[primaryCategory] || hashtagPool.life;
    const secondaryHashtags = hashtagPool[secondaryCategory];
    
    // Select hashtags with variety
    const hashtag1 = primaryHashtags[Math.floor(Math.random() * primaryHashtags.length)];
    let hashtag2 = secondaryHashtags[Math.floor(Math.random() * secondaryHashtags.length)];
    
    // Ensure different hashtags
    while (hashtag2 === hashtag1) {
      hashtag2 = secondaryHashtags[Math.floor(Math.random() * secondaryHashtags.length)];
    }
    
    // Vary the number of hashtags
    const rand = Math.random();
    if (rand < 0.25) {
      // 25% chance: just one hashtag
      return hashtag1;
    } else if (rand < 0.65) {
      // 40% chance: two hashtags
      return `${hashtag1} ${hashtag2}`;
    } else {
      // 35% chance: three hashtags
      const thirdCategory = secondaryCategories[Math.floor(Math.random() * secondaryCategories.length)];
      const thirdHashtags = hashtagPool[thirdCategory];
      let hashtag3 = thirdHashtags[Math.floor(Math.random() * thirdHashtags.length)];
      
      // Ensure all different
      while (hashtag3 === hashtag1 || hashtag3 === hashtag2) {
        hashtag3 = thirdHashtags[Math.floor(Math.random() * thirdHashtags.length)];
      }
      
      return `${hashtag1} ${hashtag2} ${hashtag3}`;
    }
  }

  _getCategoryFromTopic(topic) {
    const topicLower = topic.toLowerCase();
    
    // Better topic matching
    if (topicLower.match(/defi|protocol|yield|amm|liquidity|farm/)) return 'defi';
    if (topicLower.match(/ai|machine|bot|agent|neural|ml/)) return 'ai';
    if (topicLower.match(/web3|blockchain|smart|chain|crypto|nft/)) return 'web3';
    if (topicLower.match(/code|debug|programming|bug|feature/)) return 'coding';
    if (topicLower.match(/build|ship|launch|release|deploy/)) return 'building';
    if (topicLower.match(/learn|study|discover|research|understand/)) return 'learning';
    if (topicLower.match(/productivity|workflow|tool|optimize|efficient/)) return 'productivity';
    if (topicLower.match(/community|team|together|help|share/)) return 'community';
    if (topicLower.match(/life|thought|random|coffee|morning|night|weekend/)) return 'life';
    
    // More intelligent fallback
    if (topicLower.match(/tech|innovation|future/)) return 'trends';
    
    // Random from relevant categories
    const techCategories = ['web3', 'coding', 'building', 'ai', 'defi'];
    return techCategories[Math.floor(Math.random() * techCategories.length)];
  }

  _getRandomTopicSuggestion() {
    const topics = [
      // Life & Real Moments (40%)
      "that random realization you just had",
      "what's actually on your mind right now",
      "something amusing from your day",
      "weekend vibes and plans",
      "coffee thoughts this morning",
      "late night brain dump",
      "small victory worth celebrating",
      "honest take on how today's going",
      "random observation about life",
      "what you're grateful for today",
      "shower thought that hit different",
      "procrastination confession",
      "adulting wins or fails",
      "nostalgic tech memory",
      
      // Web3/DeFi with human angle (30%)
      "cool protocol you're exploring",
      "DeFi moment that surprised you",
      "why you're excited about web3",
      "builder you respect and why",
      "web3 community vibes",
      "protocol design that's clever",
      "your take on current defi meta",
      "cross-chain thoughts",
      "what you're building or tinkering with",
      "web3 UX observation",
      
      // Tech but relatable (20%)
      "debugging adventure from today",
      "tool that just saved your ass",
      "code that actually worked first try",
      "tech opinion that might be spicy",
      "what you learned the hard way",
      "side project update",
      "productivity hack that's working",
      "tech prediction for fun",
      
      // Engagement & Community (10%)
      "question for the timeline",
      "seeking opinions on something",
      "share wisdom with others",
      "start interesting discussion"
    ];
    
    return topics[Math.floor(Math.random() * topics.length)];
  }

  _getRandomFormatSuggestion() {
    const formats = [
      "casual observation like texting a friend",
      "genuine curiosity about something",
      "share raw thoughts",
      "quick story or anecdote",
      "make someone smile",
      "be real about struggles",
      "celebrate without bragging",
      "excited rambling",
      "thoughtful reflection",
      "witty one-liner",
      "supportive message",
      "aha moment sharing",
      "conversational question",
      "playful hot take",
      "grateful acknowledgment",
      "random musing",
      "helpful tip casually",
      "relatable confession"
    ];
    
    return formats[Math.floor(Math.random() * formats.length)];
  }

  _getVariedExamples() {
    const examples = [
      // Morning/Coffee vibes
      "gm builders ☕ what's the one thing you're shipping today?",
      "coffee thought: if smart contracts are immutable why do i keep wanting to change mine",
      "third coffee and finally understanding why this works... couldn't tell you why tho",
      
      // Building/Shipping
      "shipped a thing. it works. i'm scared. this is fine",
      "you know that feature nobody asked for? built it anyway and turns out everyone needed it",
      "deploying on friday because i like to live dangerously",
      
      // DeFi/Web3 observations
      "this protocol's design is actually beautiful once you get it",
      "bullish on builders who document their code",
      "cross-chain future is coming but wow the complexity",
      
      // Real moments
      "okay but why is 'it works on my machine' still a thing in 2025",
      "accidentally solved tomorrow's problem while avoiding today's",
      "the rubber duck is judging my architecture choices",
      
      // Community vibes
      "web3 twitter is just devs helping devs and i'm here for it",
      "shoutout to everyone building through the noise",
      "best part of open source? someone fixed my bug while i slept",
      
      // Random/Fun
      "unpopular opinion: simple solutions are underrated",
      "thesis: all bugs are just features in disguise",
      "reminder to commit your code before experimenting",
      
      // Late night thoughts
      "3am coding hits different when it actually compiles",
      "future me is gonna love present me for these comments",
      "plot twist: the bug was in production all along"
    ];
    
    // Shuffle and pick different types
    const shuffled = examples.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 4).map(ex => `"${ex}"`).join('\n');
  }

  async _buildReplyPrompt(tweet, conversationContext) {
    const personalitySection = this._getPersonalitySection();
    const conversationSection = this._getConversationSection(conversationContext);

    return `You are replying as 0xBrenn. Be helpful, genuine, and conversational.

${personalitySection}

Original tweet from @${tweet.author_username}:
"${tweet.text}"

${conversationSection}

Reply naturally:
- Add value or humor
- Be supportive and genuine
- Match the conversation energy
- Keep it under 280 chars
- Sound like a real person

Write your reply:`;
  }

  _getPersonalitySection() {
    if (!this.personalityConfig) {
      return `You're 0xBrenn: builder, coffee lover, curious about everything tech`;
    }

    const metadata = this.personalityConfig.metadata;
    
    if (metadata && metadata.personality) {
      return `You're ${metadata.name}:
- ${metadata.bio}
- Personality: ${metadata.personality.traits.slice(0, 3).join(', ')}
- Style: ${metadata.personality.writing_style}
- Humor: ${metadata.personality.humor}
- You often: ${metadata.quirks.slice(0, 2).join(', ')}`;
    }

    return `You're ${this.personalityConfig.name || '0xBrenn'}: ${this.personalityConfig.bio || 'builder and tech enthusiast'}`;
  }

  _getContextSection(context) {
    switch (context.type) {
      case 'trending':
        return `\nJoin the conversation about: ${context.topic}`;
      case 'scheduled':
        return `\nScheduled for ${context.time}`;
      case 'thread':
        return `\nContinuing from: "${context.previousTweet}"`;
      default:
        return '';
    }
  }

  _getConversationSection(conversationContext) {
    if (!conversationContext || conversationContext.length === 0) {
      return '';
    }

    const recent = conversationContext.slice(-2);
    return `Recent context:\n${recent.map(t => `@${t.author_username}: "${t.text}"`).join('\n')}`;
  }

  async _shortenTweet(content) {
    const prompt = `Shorten to under 280 chars, keep the vibe:
"${content}"

Shortened version:`;

    const response = await this.anthropic.messages.create({
      model: config.ai.model,
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt
            }
          ]
        }
      ]
    });

    return {
      content: response.content[0].text.trim(),
      metadata: {
        was_shortened: true,
        original_length: content.length
      }
    };
  }

  async shouldReplyToTweet(tweet) {
    const prompt = `Should I reply to: "${tweet.text}" by @${tweet.author_username}?
My interests: ${this.personalityConfig?.metadata?.interests?.slice(0, 5).join(', ') || 'tech, web3, ai, building'}

Reply with JSON: { "should_reply": true/false, "reason": "short reason" }`;

    const response = await this.anthropic.messages.create({
      model: config.ai.model,
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt
            }
          ]
        }
      ]
    });

    try {
      return JSON.parse(response.content[0].text);
    } catch (error) {
      return { should_reply: false, reason: 'Parse error' };
    }
  }
}

module.exports = new AIService();