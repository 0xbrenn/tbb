// scripts/test-ai.js - Test the AI service directly
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Anthropic = require('@anthropic-ai/sdk');

async function testAI() {
  try {
    console.log('Testing Anthropic API...');
    console.log('API Key:', process.env.ANTHROPIC_API_KEY ? 'Set ✓' : 'Missing ✗');
    
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    
    const testPrompt = "Generate a tweet in the style of a casual tech enthusiast. Just the tweet text, nothing else.";
    
    console.log('\nSending test prompt...');
    
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: testPrompt
            }
          ]
        }
      ]
    });
    
    console.log('\n✅ Success! Response:', response.content[0].text);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Full error:', error);
  }
}

testAI();