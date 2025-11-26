// Migration script to add transcribed_text column to messages table
const { pool } = require('./models/database');

async function addTranscribedTextColumn() {
    const client = await pool.connect();

    try {
        console.log('Adding transcribed_text column to messages table...');

        await client.query(`
            ALTER TABLE messages 
            ADD COLUMN IF NOT EXISTS transcribed_text TEXT;
        `);

        console.log('✅ Successfully added transcribed_text column');

    } catch (error) {
        console.error('❌ Error adding column:', error);
        throw error;
    } finally {
        client.release();
    }
}

addTranscribedTextColumn()
    .then(() => {
        console.log('Migration completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Migration failed:', error);
        process.exit(1);
    });
