require('dotenv').config();
const { pool } = require('./models/database');

async function addMediaColumns() {
    try {
        console.log('Adding media columns to messages table...');

        await pool.query(`
      ALTER TABLE messages 
      ADD COLUMN IF NOT EXISTS media_url TEXT,
      ADD COLUMN IF NOT EXISTS media_type VARCHAR(50)
    `);

        console.log('✅ Media columns added successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error adding columns:', error);
        process.exit(1);
    }
}

addMediaColumns();
