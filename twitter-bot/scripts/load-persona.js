// scripts/load-persona.js
const fs = require('fs');
const path = require('path');

// Load environment variables first
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Now load the config which depends on env vars
const config = require('../config');

// Import Supabase client directly
const { createClient } = require('@supabase/supabase-js');

async function loadPersonaFromJSON() {
  try {
    // Create Supabase client
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    
    // Read the persona.json file
    const personaPath = path.join(__dirname, '..', 'persona.json');
    
    if (!fs.existsSync(personaPath)) {
      console.error('❌ persona.json not found! Create it in your project root.');
      console.log('📁 Expected location:', personaPath);
      process.exit(1);
    }
    
    const personaData = JSON.parse(fs.readFileSync(personaPath, 'utf8'));
    
    console.log('📄 Loading persona from persona.json...');
    console.log('👤 Name:', personaData.name);
    console.log('✍️  Style:', personaData.personality.writing_style);
    
    // Prepare data for database
    const dbConfig = {
      name: personaData.name,
      bio: personaData.bio,
      interests: personaData.interests,
      writing_style: personaData.personality.writing_style,
      tone: personaData.personality.tone,
      topics: personaData.topics.primary.concat(personaData.topics.secondary),
      avoid_topics: personaData.avoid_topics,
      quirks: personaData.quirks,
      metadata: personaData // Store full persona data
    };
    
    // First, check if a config exists
    const { data: existingConfig } = await supabase
      .from('personality_config')
      .select('*')
      .single();
    
    let result;
    if (existingConfig) {
      // Update existing config
      result = await supabase
        .from('personality_config')
        .update(dbConfig)
        .eq('id', existingConfig.id)
        .select()
        .single();
    } else {
      // Insert new config
      result = await supabase
        .from('personality_config')
        .insert([dbConfig])
        .select()
        .single();
    }
    
    if (result.error) throw result.error;
    
    console.log('✅ Personality config updated!');
    
    // Add example tweets to training data
    if (personaData.example_tweets && personaData.example_tweets.length > 0) {
      console.log('\n📝 Adding example tweets to training data...');
      
      let addedCount = 0;
      for (const tweet of personaData.example_tweets) {
        try {
          const { error } = await supabase
            .from('training_tweets')
            .insert({
              text: tweet,
              is_approved: true,
              created_at: new Date().toISOString()
            });
          
          if (!error) {
            console.log(`✓ Added: "${tweet.substring(0, 50)}..."`);
            addedCount++;
          } else if (error.code === '23505') {
            console.log(`⚠️  Already exists: "${tweet.substring(0, 50)}..."`);
          } else {
            throw error;
          }
        } catch (err) {
          console.error(`❌ Error adding tweet:`, err.message);
        }
      }
      
      console.log(`\n✅ Added ${addedCount} new example tweets`);
    }
    
    console.log('\n🎉 Persona loaded successfully!');
    console.log('📝 Summary:');
    console.log(`   - Name: ${personaData.name}`);
    console.log(`   - Topics: ${dbConfig.topics.join(', ')}`);
    console.log(`   - Example tweets: ${personaData.example_tweets?.length || 0}`);
    console.log('\nRun "yarn run test-mode" to test your AI clone');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error loading persona:', error.message || error);
    process.exit(1);
  }
}

// Run the loader
loadPersonaFromJSON();