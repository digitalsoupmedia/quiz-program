#!/usr/bin/env node

// Load environment variables
require('dotenv').config();

// Use the same database configuration as the main application
const db = require('../config/database');

async function fixThirdPlaceConstraint() {
    try {
        console.log('🔄 Fixing third place winner constraint...');
        
        // Drop the existing constraint
        console.log('📝 Dropping old constraint...');
        await db.query(`
            ALTER TABLE prize_winners 
            DROP CONSTRAINT IF EXISTS prize_winners_prize_position_check
        `);
        
        // Add the new constraint that includes position 3
        console.log('📝 Adding new constraint (1, 2, 3)...');
        await db.query(`
            ALTER TABLE prize_winners 
            ADD CONSTRAINT prize_winners_prize_position_check 
            CHECK (prize_position IN (1, 2, 3))
        `);
        
        // Verify the change
        console.log('🔍 Verifying constraint...');
        const result = await db.query(`
            SELECT constraint_name, check_clause 
            FROM information_schema.check_constraints 
            WHERE constraint_name = 'prize_winners_prize_position_check'
        `);
        
        if (result.rows.length > 0) {
            console.log('✅ Success! New constraint:');
            console.log(`   ${result.rows[0].constraint_name}: ${result.rows[0].check_clause}`);
        }
        
        // Test insertion
        console.log('🧪 Testing third place insertion...');
        try {
            await db.query(`
                INSERT INTO prize_winners (session_id, participant_id, prize_position, score, completion_time_seconds)
                VALUES (-999, -999, 3, 75.5, 600)
            `);
            console.log('✅ Third place insertion test successful!');
            
            // Clean up test data
            await db.query('DELETE FROM prize_winners WHERE session_id = -999');
            console.log('🧹 Test data cleaned up');
            
        } catch (testError) {
            console.log('❌ Third place insertion test failed:');
            console.log(`   ${testError.message}`);
        }
        
        console.log('\n🎉 Migration completed! Third place winners are now supported.');
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error('Full error:', error);
        process.exit(1);
    } finally {
        await db.end();
    }
}

// Run the fix
fixThirdPlaceConstraint().catch(console.error);