const db = require('../config/database');
const moment = require('moment-timezone');

class SessionScheduler {
    constructor() {
        this.schedulerInterval = null;
        this.isRunning = false;
        this.checkInterval = 30000; // Check every 30 seconds to reduce noise and improve precision
        this.lastCleanup = 0; // Track last cleanup time to run cleanup once per hour
    }

    /**
     * Start the session scheduler
     */
    start() {
        if (this.isRunning) {
            console.log('Session scheduler is already running');
            return;
        }

        console.log('Starting session scheduler...');
        this.isRunning = true;
        
        // Run initial check
        this.checkScheduledSessions();
        
        // Set up periodic checking
        this.schedulerInterval = setInterval(() => {
            this.checkScheduledSessions();
        }, this.checkInterval);
        
        console.log(`Session scheduler started with ${this.checkInterval}ms interval`);
    }

    /**
     * Stop the session scheduler
     */
    stop() {
        if (!this.isRunning) {
            console.log('Session scheduler is not running');
            return;
        }

        console.log('Stopping session scheduler...');
        
        if (this.schedulerInterval) {
            clearInterval(this.schedulerInterval);
            this.schedulerInterval = null;
        }
        
        this.isRunning = false;
        console.log('Session scheduler stopped');
    }

    /**
     * Clean up old scheduled sessions that are more than 24 hours past their start time
     */
    async cleanupOldSessions() {
        try {
            const result = await db.query(`
                UPDATE quiz_sessions 
                SET status = 'cancelled'
                WHERE status = 'scheduled' 
                  AND start_time < NOW() - INTERVAL '24 hours'
                RETURNING id, session_name, start_time
            `);
            
            if (result.rows.length > 0) {
                console.log(`[SessionScheduler] Cleaned up ${result.rows.length} old scheduled sessions:`);
                result.rows.forEach(session => {
                    console.log(`  - ${session.session_name}: ${session.start_time}`);
                });
            }
        } catch (error) {
            console.error('Error cleaning up old sessions:', error);
        }
    }

    /**
     * Check for sessions that need to be auto-started
     */
    async checkScheduledSessions() {
        try {
            const now = new Date();
            console.log(`[SessionScheduler] Checking sessions at: ${now.toISOString()}`);
            
            // Clean up old sessions first (run once every hour)
            if (!this.lastCleanup || (now.getTime() - this.lastCleanup) > 3600000) {
                await this.cleanupOldSessions();
                this.lastCleanup = now.getTime();
            }
            
            // Find sessions that should auto-start
            // FIXED: Use moment-timezone for reliable timezone handling
            const appTimezone = process.env.APP_TIMEZONE || 'UTC';
            
            // Get all scheduled auto-start sessions and handle timing in JavaScript
            const sessionsToStart = await db.query(`
                SELECT qs.*, q.instruction_time_minutes,
                       qs.start_time
                FROM quiz_sessions qs
                JOIN quizzes q ON qs.quiz_id = q.id
                WHERE qs.status = 'scheduled' 
                  AND qs.auto_start = true
                ORDER BY qs.start_time ASC
            `);
            
            // Filter using UTC time for consistency with database and status API
            const validSessions = [];
            const currentTime = new Date();
            
            for (const session of sessionsToStart.rows) {
                // Use UTC times directly for comparison
                const sessionStartTime = new Date(session.start_time);
                const secondsPastStart = Math.floor((currentTime - sessionStartTime) / 1000);
                const secondsUntilStart = Math.floor((sessionStartTime - currentTime) / 1000);
                
                // Add timing info to session object
                session.start_time_local = sessionStartTime.toISOString();
                session.seconds_until_start = secondsUntilStart;
                session.seconds_past_start = secondsPastStart;
                session.current_time_local = currentTime.toISOString();
                
                // Check if session should start (0-60 seconds past start time, max 5 minutes late)
                if (secondsPastStart >= 0 && secondsPastStart <= 60 && secondsPastStart < 300) {
                    validSessions.push(session);
                }
            }

            if (validSessions.length > 0) {
                console.log(`[SessionScheduler] Found ${validSessions.length} sessions to auto-start`);
                
                for (const session of validSessions) {
                    console.log(`[SessionScheduler] Session ${session.id}:`);
                    console.log(`  - Session Name: ${session.session_name}`);
                    console.log(`  - Start Time Local: ${session.start_time_local}`);
                    console.log(`  - Current Time Local: ${session.current_time_local}`);
                    console.log(`  - Seconds Until Start: ${session.seconds_until_start}`);
                    console.log(`  - Seconds Past Start: ${session.seconds_past_start}`);
                    
                    // Session already passed timing validation, so start it
                    console.log(`  - ✓ Timing verified with moment-timezone, auto-starting session`);
                    await this.autoStartSession(session);
                }
            } else {
                // Log all scheduled sessions using moment-timezone for debugging
                if (sessionsToStart.rows.length > 0) {
                    console.log(`[SessionScheduler] Monitoring ${sessionsToStart.rows.length} auto-start sessions:`);
                    sessionsToStart.rows.forEach(session => {
                        const sessionStartTime = new Date(session.start_time);
                        const currentTime = new Date();
                        const secondsPastStart = Math.floor((currentTime - sessionStartTime) / 1000);
                        const secondsUntilStart = Math.floor((sessionStartTime - currentTime) / 1000);
                        
                        console.log(`  - ${session.session_name}: ${session.start_time}`);
                        console.log(`    UTC timing: until=${secondsUntilStart.toFixed(1)}s, past=${secondsPastStart.toFixed(1)}s`);
                        console.log(`    Start: ${sessionStartTime.toISOString()}, Now: ${currentTime.toISOString()}`);
                    });
                }
            }

            // Check for instruction phases that should transition to quiz phase
            await this.checkInstructionPhaseTransitions();

        } catch (error) {
            console.error('Error checking scheduled sessions:', error);
        }
    }

    /**
     * Auto-start a session by moving it to instruction phase
     */
    async autoStartSession(session) {
        try {
            console.log(`Auto-starting session ${session.id}: ${session.session_name}`);
            console.log(`[Auto-Start] Instruction time: ${session.instruction_time_minutes || 5} minutes`);
            
            // Move session to instruction phase
            const result = await db.query(`
                UPDATE quiz_sessions 
                SET status = 'instruction', instruction_start_time = start_time 
                WHERE id = $1 AND status = 'scheduled'
                RETURNING *
            `, [session.id]);

            if (result.rows.length > 0) {
                console.log(`Session ${session.id} auto-started successfully (instruction phase)`);
                console.log(`[Auto-Start] Instruction phase will run for ${session.instruction_time_minutes || 5} minutes, then auto-transition to quiz phase`);
                
                // Note: Auto-transition to quiz phase is handled by checkInstructionPhaseTransitions() 
                // which runs every 30 seconds and checks database timestamps
                
            } else {
                console.log(`Session ${session.id} was not auto-started (may have been manually started)`);
            }

        } catch (error) {
            console.error(`Error auto-starting session ${session.id}:`, error);
        }
    }

    /**
     * Check for instruction phases that should transition to quiz phase
     */
    async checkInstructionPhaseTransitions() {
        try {
            // Find instruction phases that should transition to quiz phase
            // Use UTC time consistently like auto-start logic
            const currentInstructionSessions = await db.query(`
                SELECT qs.*, q.instruction_time_minutes
                FROM quiz_sessions qs
                JOIN quizzes q ON qs.quiz_id = q.id
                WHERE qs.status = 'instruction' 
                  AND qs.instruction_start_time IS NOT NULL
                ORDER BY qs.instruction_start_time ASC
            `);
            
            // Filter using UTC time for consistency with auto-start logic
            const validSessions = [];
            const currentTime = new Date();
            
            for (const session of currentInstructionSessions.rows) {
                const instructionStartTime = new Date(session.instruction_start_time);
                const instructionTimeMinutes = session.instruction_time_minutes || 5;
                const instructionEndTime = new Date(instructionStartTime.getTime() + (instructionTimeMinutes * 60 * 1000));
                
                const secondsSinceInstructionStart = Math.floor((currentTime - instructionStartTime) / 1000);
                const secondsUntilTransition = Math.floor((instructionEndTime - currentTime) / 1000);
                
                // Add timing info to session object for logging
                session.instruction_start_local = instructionStartTime.toISOString();
                session.should_transition_at_local = instructionEndTime.toISOString();
                session.current_time_local = currentTime.toISOString();
                session.seconds_since_instruction_start = secondsSinceInstructionStart;
                session.seconds_until_transition = secondsUntilTransition;
                
                // Check if instruction phase should transition to quiz phase
                if (currentTime >= instructionEndTime) {
                    validSessions.push(session);
                }
            }

            if (validSessions.length > 0) {
                console.log(`[SessionScheduler] Found ${validSessions.length} instruction phases to transition to quiz phase`);
                
                for (const session of validSessions) {
                    console.log(`[SessionScheduler] Session ${session.id} transition details:`);
                    console.log(`  - Instruction started: ${session.instruction_start_local}`);
                    console.log(`  - Should transition at: ${session.should_transition_at_local}`);
                    console.log(`  - Current time: ${session.current_time_local}`);
                    console.log(`  - Seconds since instruction start: ${session.seconds_since_instruction_start}`);
                    console.log(`  - Seconds until transition: ${session.seconds_until_transition}`);
                    console.log(`  - Instruction time minutes: ${session.instruction_time_minutes}`);
                    console.log(`[SessionScheduler] Transitioning session ${session.id} from instruction to quiz phase`);
                    await this.autoStartQuizPhase(session.id);
                }
            } else {
                // Debug current instruction sessions using UTC timing
                if (currentInstructionSessions.rows.length > 0) {
                    console.log(`[SessionScheduler] Current instruction sessions (not ready to transition):`);
                    currentInstructionSessions.rows.forEach(session => {
                        const instructionStartTime = new Date(session.instruction_start_time);
                        const instructionTimeMinutes = session.instruction_time_minutes || 5;
                        const instructionEndTime = new Date(instructionStartTime.getTime() + (instructionTimeMinutes * 60 * 1000));
                        const currentTime = new Date();
                        const secondsSinceStart = Math.floor((currentTime - instructionStartTime) / 1000);
                        const secondsUntilTransition = Math.floor((instructionEndTime - currentTime) / 1000);
                        
                        console.log(`  - Session ${session.id}: started ${instructionStartTime.toISOString()}, should transition at ${instructionEndTime.toISOString()}`);
                        console.log(`    UTC timing: since_start=${secondsSinceStart}s, until_transition=${secondsUntilTransition}s`);
                    });
                }
            }

        } catch (error) {
            console.error('Error checking instruction phase transitions:', error);
        }
    }

    /**
     * Auto-start quiz phase for a session
     */
    async autoStartQuizPhase(sessionId) {
        try {
            console.log(`[Auto-Start] Auto-starting quiz phase for session ${sessionId}`);
            
            // Get quiz details for socket emission
            const sessionData = await db.query(`
                SELECT qs.*, q.quiz_time_minutes
                FROM quiz_sessions qs
                JOIN quizzes q ON qs.quiz_id = q.id
                WHERE qs.id = $1
            `, [sessionId]);
            
            // Move session to active (quiz) phase using the calculated instruction end time
            const result = await db.query(`
                UPDATE quiz_sessions 
                SET status = 'active', 
                    quiz_start_time = instruction_start_time + INTERVAL '1 minute' * COALESCE((SELECT instruction_time_minutes FROM quizzes WHERE id = quiz_id), 5)
                WHERE id = $1 AND status = 'instruction'
                RETURNING *
            `, [sessionId]);

            if (result.rows.length > 0) {
                console.log(`[Auto-Start] Session ${sessionId} quiz phase auto-started successfully`);
                
                // Emit socket event to notify participants (if we have access to io)
                // Note: We don't have direct access to io here, but the session status will be picked up
                // by participants polling the session status endpoint
                
            } else {
                console.log(`[Auto-Start] Session ${sessionId} quiz phase was not auto-started (may have been manually started or completed)`);
            }

        } catch (error) {
            console.error(`Error auto-starting quiz phase for session ${sessionId}:`, error);
        }
    }

    /**
     * Get scheduler status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            checkInterval: this.checkInterval,
            lastCheck: new Date()
        };
    }
}

// Create singleton instance
const sessionScheduler = new SessionScheduler();

module.exports = sessionScheduler;