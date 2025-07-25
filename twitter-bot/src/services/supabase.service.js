// src/services/supabase.service.js
const { createClient } = require('@supabase/supabase-js');
const config = require('../../config');
const logger = require('../utils/logger');

class SupabaseService {
  constructor() {
    this.client = createClient(config.supabase.url, config.supabase.serviceKey);
  }

  // Personality & Configuration
  async getPersonalityConfig() {
    try {
      const { data, error } = await this.client
        .from('personality_config')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        // PGRST116 is "no rows returned" which is okay
        throw error;
      }
      
      return data || {};
    } catch (error) {
      logger.error('Error getting personality config:', error);
      return {};
    }
  }

   async updatePersonalityConfig(updates) {
    try {
      // First get the existing config
      const { data: existing } = await this.client
        .from('personality_config')
        .select('id')
        .single();
      
      if (!existing) {
        // If no config exists, insert instead of update
        const { data, error } = await this.client
          .from('personality_config')
          .insert([updates])
          .select()
          .single();
        
        if (error) throw error;
        return data;
      }
      
      // Update existing config with proper WHERE clause
      const { data, error } = await this.client
        .from('personality_config')
        .update(updates)
        .eq('id', existing.id)  // Add WHERE clause
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Error updating personality config:', error);
      throw error;
    }
  }

  // Training Data
  async getTrainingTweets(limit = 1000) {
    try {
      const { data, error } = await this.client
        .from('training_tweets')
        .select('*')
        .eq('is_approved', true)
        .limit(limit)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('Error getting training tweets:', error);
      return [];
    }
  }

  // Test Queue Management
  async saveToTestQueue(content, metadata) {
    try {
      const { data, error } = await this.client
        .from('test_queue')
        .insert([{
          content,
          metadata: metadata || {},
          created_at: new Date().toISOString(),
          status: 'pending'
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Error saving to test queue:', error);
      throw error;
    }
  }

  async getTestQueue() {
    try {
      const { data, error } = await this.client
        .from('test_queue')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('Error getting test queue:', error);
      return [];
    }
  }

  async updateTestStatus(testId, status) {
    try {
      const { data, error } = await this.client
        .from('test_queue')
        .update({ 
          status, 
          updated_at: new Date().toISOString() 
        })
        .eq('id', testId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Error updating test status:', error);
      throw error;
    }
  }

  async updateTestContent(testId, content) {
    try {
      const { data, error } = await this.client
        .from('test_queue')
        .update({ 
          content,
          updated_at: new Date().toISOString() 
        })
        .eq('id', testId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Error updating test content:', error);
      throw error;
    }
  }

  // Scheduled Posts
  async getScheduledTweets() {
    try {
      const { data, error } = await this.client
        .from('scheduled_posts')
        .select('*')
        .eq('status', 'pending')
        .lte('scheduled_time', new Date().toISOString())
        .order('scheduled_time', { ascending: true });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('Error getting scheduled tweets:', error);
      return [];
    }
  }

  // Analytics
  async getRecentInteractions(hours = 24) {
    try {
      const since = new Date();
      since.setHours(since.getHours() - hours);

      const { data, error } = await this.client
        .from('interaction_log')
        .select('*')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('Error getting recent interactions:', error);
      return [];
    }
  }

  async logInteraction(interaction) {
    try {
      const { data, error } = await this.client
        .from('interaction_log')
        .insert([{
          ...interaction,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Error logging interaction:', error);
      return null;
    }
  }

  // Tweet Management
  async saveTweet(tweet) {
    try {
      const { data, error } = await this.client
        .from('tweets')
        .insert([tweet])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Error saving tweet:', error);
      throw error;
    }
  }

  // Conversation Management
  async saveConversation(conversation) {
    try {
      const { data, error } = await this.client
        .from('conversations')
        .insert([conversation])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Error saving conversation:', error);
      throw error;
    }
  }

  async getConversationContext(conversationId) {
    try {
      const { data, error } = await this.client
        .from('conversations')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('Error getting conversation context:', error);
      return [];
    }
  }
}

module.exports = new SupabaseService();