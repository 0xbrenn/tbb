// config/test.js
module.exports = {
  twitter: {
    apiKey: process.env.TWITTER_API_KEY,
    apiSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
    bearerToken: process.env.TWITTER_BEARER_TOKEN
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceKey: process.env.SUPABASE_SERVICE_KEY
  },
  ai: {
    provider: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4-20250514',
    maxTokens: 500
  },
  bot: {
    username: process.env.BOT_USERNAME || 'test_bot',
    tweetsPerDay: parseInt(process.env.TWEETS_PER_DAY) || 3,
    maxRepliesPerHour: parseInt(process.env.MAX_REPLIES_PER_HOUR) || 5,
    enableAutoPosting: false // Always false in test mode
  },
  server: {
    port: process.env.PORT || 3000,
    dashboardPort: process.env.DASHBOARD_PORT || 3001
  },
  logging: {
    level: 'debug',
    file: 'logs/test.log'
  }
};