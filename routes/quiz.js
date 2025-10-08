const express = require('express');
const { authenticateAdmin, authenticateParticipant, authorizeAdmin } = require('../middleware/auth');
const db = require('../config/database');
const { triggerPrizeCalculation } = require('../utils/prizeCalculator');

const router = express.Router();

// Get public quiz information (no auth required)
router.get('/public/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        const result = await db.query(`
            SELECT qs.id, qs.session_name, qs.start_time, qs.status, qs.max_participants,
                   q.title, q.description, q.total_questions, q.instruction_time_minutes, q.quiz_time_minutes
            FROM quiz_sessions qs
            JOIN quizzes q ON qs.quiz_id = q.id
            WHERE qs.id = $1
        `, [sessionId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Quiz session not found'
            });
        }
        
        // Get current participant count
        const countResult = await db.query(
            'SELECT COUNT(*) FROM session_participants WHERE session_id = $1',
            [sessionId]
        );
        
        const sessionData = result.rows[0];
        sessionData.current_participants = parseInt(countResult.rows[0].count);
        
        res.json({
            success: true,
            data: sessionData
        });
        
    } catch (error) {
        console.error('Get public quiz info error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get quiz information'
        });
    }
});

// Get quiz session status and timer info
router.get('/session/:sessionId/status', async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        const result = await db.query(`
            SELECT qs.*, q.instruction_time_minutes, q.quiz_time_minutes
            FROM quiz_sessions qs
            JOIN quizzes q ON qs.quiz_id = q.id
            WHERE qs.id = $1
        `, [sessionId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }
        
        const session = result.rows[0];
        let timeInfo = {};
        
        // Calculate time information - database stores UTC, so use direct Date objects
        const now = new Date();
        
        if (session.status === 'instruction' && session.instruction_start_time) {
            const instructionStart = new Date(session.instruction_start_time);
            const instructionEnd = new Date(instructionStart.getTime() + (session.instruction_time_minutes * 60 * 1000));
            const remainingMs = Math.max(0, instructionEnd.getTime() - now.getTime());
            
            timeInfo = {
                phase: 'instruction',
                startTime: instructionStart.toISOString(),
                endTime: instructionEnd.toISOString(),
                remainingTime: remainingMs
            };
        } else if (session.status === 'active' && session.quiz_start_time) {
            const quizStart = new Date(session.quiz_start_time);
            const quizEnd = new Date(quizStart.getTime() + (session.quiz_time_minutes * 60 * 1000));
            const remainingMs = Math.max(0, quizEnd.getTime() - now.getTime());
            
            timeInfo = {
                phase: 'quiz',
                startTime: quizStart.toISOString(),
                endTime: quizEnd.toISOString(),
                remainingTime: remainingMs
            };
        }
        
        res.json({
            success: true,
            data: {
                session: session,
                timeInfo: timeInfo
            }
        });
        
    } catch (error) {
        console.error('Get session status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get session status'
        });
    }
});

// Get leaderboard for a session (Admin only)
router.get('/session/:sessionId/leaderboard', authorizeAdmin(), async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        const result = await db.query(`
            SELECT r.*, p.name, p.company, pw.prize_position
            FROM results r
            JOIN participants p ON r.participant_id = p.id
            LEFT JOIN prize_winners pw ON r.session_id = pw.session_id AND r.participant_id = pw.participant_id
            WHERE r.session_id = $1
            ORDER BY r.total_score DESC, r.completion_time_seconds ASC
            LIMIT 10
        `, [sessionId]);
        
        res.json({
            success: true,
            data: result.rows
        });
        
    } catch (error) {
        console.error('Get leaderboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get leaderboard'
        });
    }
});

// Admin routes for quiz management
router.use(authenticateAdmin); // All routes below require admin authentication

// Get all quizzes
router.get('/', authorizeAdmin(), async (req, res) => {
    try {
        const result = await db.query(`
            SELECT q.*, 
                   (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) as question_count,
                   (SELECT COUNT(*) FROM quiz_sessions WHERE quiz_id = q.id) as session_count
            FROM quizzes q
            ORDER BY q.created_at DESC
        `);
        
        res.json({
            success: true,
            data: result.rows
        });
        
    } catch (error) {
        console.error('Get quizzes error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get quizzes'
        });
    }
});

// Get quiz by ID
router.get('/:quizId', authorizeAdmin(), async (req, res) => {
    try {
        const { quizId } = req.params;
        
        const quizResult = await db.query('SELECT * FROM quizzes WHERE id = $1', [quizId]);
        
        if (quizResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Quiz not found'
            });
        }
        
        // Get questions
        const questionsResult = await db.query(
            'SELECT * FROM questions WHERE quiz_id = $1 ORDER BY question_order ASC',
            [quizId]
        );
        
        res.json({
            success: true,
            data: {
                quiz: quizResult.rows[0],
                questions: questionsResult.rows
            }
        });
        
    } catch (error) {
        console.error('Get quiz error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get quiz'
        });
    }
});

// Update quiz
router.put('/:quizId', authorizeAdmin(), async (req, res) => {
    try {
        const { quizId } = req.params;
        const { title, description, startDate, startTime, totalQuestions } = req.body;
        
        const result = await db.query(`
            UPDATE quizzes 
            SET title = $1, description = $2, start_date = $3, start_time = $4, total_questions = $5, updated_at = CURRENT_TIMESTAMP
            WHERE id = $6
            RETURNING *
        `, [title, description, startDate, startTime, totalQuestions, quizId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Quiz not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Quiz updated successfully',
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Update quiz error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update quiz'
        });
    }
});

// Delete quiz
router.delete('/:quizId', authorizeAdmin(), async (req, res) => {
    try {
        const { quizId } = req.params;
        
        // Check if quiz has any sessions
        const sessionCheck = await db.query(
            'SELECT COUNT(*) FROM quiz_sessions WHERE quiz_id = $1',
            [quizId]
        );
        
        if (parseInt(sessionCheck.rows[0].count) > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete quiz with existing sessions'
            });
        }
        
        const result = await db.query('DELETE FROM quizzes WHERE id = $1 RETURNING *', [quizId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Quiz not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Quiz deleted successfully'
        });
        
    } catch (error) {
        console.error('Delete quiz error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete quiz'
        });
    }
});

// Get all sessions for a quiz
router.get('/:quizId/sessions', authorizeAdmin(), async (req, res) => {
    try {
        const { quizId } = req.params;
        
        const result = await db.query(`
            SELECT qs.*, 
                   (SELECT COUNT(*) FROM session_participants WHERE session_id = qs.id) as participant_count
            FROM quiz_sessions qs
            WHERE qs.quiz_id = $1
            ORDER BY qs.start_time DESC
        `, [quizId]);
        
        res.json({
            success: true,
            data: result.rows
        });
        
    } catch (error) {
        console.error('Get quiz sessions error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get quiz sessions'
        });
    }
});

// Get session results for admin view
router.get('/session/:sessionId/results', authorizeAdmin(), async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        // Get session info
        const sessionResult = await db.query(`
            SELECT qs.*, q.title as quiz_title, q.description as quiz_description
            FROM quiz_sessions qs
            JOIN quizzes q ON qs.quiz_id = q.id
            WHERE qs.id = $1
        `, [sessionId]);
        
        if (sessionResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }
        
        // Get all participant results
        const resultsResult = await db.query(`
            SELECT r.*, p.name, p.email, p.company, p.designation,
                   pw.prize_position,
                   sp.joined_at, sp.submitted_at, sp.status as participation_status
            FROM results r
            JOIN participants p ON r.participant_id = p.id
            JOIN session_participants sp ON r.session_id = sp.session_id AND r.participant_id = sp.participant_id
            LEFT JOIN prize_winners pw ON r.session_id = pw.session_id AND r.participant_id = pw.participant_id
            WHERE r.session_id = $1
            ORDER BY r.total_score DESC, r.completion_time_seconds ASC
        `, [sessionId]);
        
        // Get session statistics
        const statsResult = await db.query(`
            SELECT 
                COUNT(*) as total_participants,
                COUNT(*) FILTER (WHERE sp.status = 'submitted') as completed_count,
                AVG(r.total_score) as avg_score,
                MAX(r.total_score) as max_score,
                MIN(r.total_score) as min_score,
                AVG(r.percentage_score) as avg_percentage
            FROM session_participants sp
            LEFT JOIN results r ON sp.session_id = r.session_id AND sp.participant_id = r.participant_id
            WHERE sp.session_id = $1
        `, [sessionId]);
        
        res.json({
            success: true,
            data: {
                session: sessionResult.rows[0],
                results: resultsResult.rows,
                statistics: statsResult.rows[0]
            }
        });
        
    } catch (error) {
        console.error('Get session results error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get session results'
        });
    }
});

// Manually trigger prize calculation for a session
router.post('/session/:sessionId/calculate-prizes', authorizeAdmin(), async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        // Verify session exists
        const sessionResult = await db.query(
            'SELECT id, status FROM quiz_sessions WHERE id = $1',
            [sessionId]
        );
        
        if (sessionResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }
        
        const result = await triggerPrizeCalculation(sessionId);
        
        if (result.success) {
            res.json({
                success: true,
                message: 'Prize calculation completed successfully',
                data: result.winners
            });
        } else {
            res.status(500).json({
                success: false,
                message: result.message || 'Prize calculation failed'
            });
        }
        
    } catch (error) {
        console.error('Manual prize calculation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to calculate prizes'
        });
    }
});

// Auto-submit participant when time expires (called by timer service)
router.post('/session/:sessionId/auto-submit/:participantId', async (req, res) => {
    try {
        const { sessionId, participantId } = req.params;
        
        // Verify session and participant
        const participantResult = await db.query(`
            SELECT sp.*, qs.status
            FROM session_participants sp
            JOIN quiz_sessions qs ON sp.session_id = qs.id
            WHERE sp.session_id = $1 AND sp.participant_id = $2 AND sp.status != 'submitted'
        `, [sessionId, participantId]);
        
        if (participantResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Participant not found or already submitted'
            });
        }
        
        // Auto-submit the participant
        await db.query(`
            UPDATE session_participants 
            SET submitted_at = CURRENT_TIMESTAMP, status = 'submitted'
            WHERE session_id = $1 AND participant_id = $2
        `, [sessionId, participantId]);
        
        // Don't calculate individual results here - will be calculated when session ends
        console.log(`Participant ${participantId} auto-submitted for session ${sessionId} - results will be calculated when session ends`);
        
        res.json({
            success: true,
            message: 'Participant auto-submitted successfully'
        });
        
    } catch (error) {
        console.error('Auto-submit error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to auto-submit participant'
        });
    }
});

module.exports = router;