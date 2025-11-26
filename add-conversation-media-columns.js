require('dotenv').config();
const { pool } = require('./models/database');

async function addMediaColumnsToConversations() {
    try {
        console.log('Adding media columns to conversation_messages table...');

        await pool.query(`
      ALTER TABLE conversation_messages 
      ADD COLUMN IF NOT EXISTS media_url TEXT,
      ADD COLUMN IF NOT EXISTS media_type VARCHAR(50)
    `);

        console.log('✅ Media columns added successfully to conversation_messages!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error adding columns:', error);
        process.exit(1);
    }
}

addMediaColumnsToConversations();
