const express = require('express');
const { authenticateParticipant, checkSessionAccess, checkNotSubmitted, checkQuizState } = require('../middleware/auth');
const db = require('../config/database');
const { redisHelper } = require('../config/redis');
const { triggerPrizeCalculation } = require('../utils/prizeCalculator');
const { getShuffledQuestionsForParticipant } = require('../utils/questionShuffler');

const router = express.Router();

// Helper function to add timeout to database queries
const withTimeout = (promise, timeoutMs = 5000, timeoutMessage = 'Database query timeout') => {
    return Promise.race([
        promise,
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
        )
    ]);
};

// Get participant profile
router.get('/profile', authenticateParticipant, async (req, res) => {
    try {
        const result = await withTimeout(
            db.query(`
                SELECT p.*, uc.username, uc.last_login
                FROM participants p
                JOIN user_credentials uc ON p.id = uc.participant_id
                WHERE p.id = $1
            `, [req.user.id]),
            3000,
            'Profile query timeout'
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Participant not found'
            });
        }
        
        const participant = result.rows[0];
        delete participant.password_hash; // Remove sensitive data
        
        res.json({
            success: true,
            data: participant
        });
        
    } catch (error) {
        console.error('Get participant profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get participant profile'
        });
    }
});

// Get available quiz sessions for participant
router.get('/sessions', authenticateParticipant, async (req, res) => {
    try {
        const result = await withTimeout(
            db.query(`
                SELECT qs.*, q.title, q.description, q.total_questions,
                       sp.status as participation_status, sp.joined_at, sp.submitted_at
                FROM quiz_sessions qs
                JOIN quizzes q ON qs.quiz_id = q.id
                LEFT JOIN session_participants sp ON qs.id = sp.session_id AND sp.participant_id = $1
                WHERE qs.status IN ('scheduled', 'instruction', 'active', 'completed')
                ORDER BY 
                    CASE qs.status 
                        WHEN 'instruction' THEN 1
                        WHEN 'active' THEN 2
                        WHEN 'scheduled' THEN 3
                        WHEN 'completed' THEN 4
                    END,
                    qs.start_time DESC
            `, [req.user.id]),
            5000,
            'Sessions list query timeout'
        );
        
        res.json({
            success: true,
            data: result.rows
        });
        
    } catch (error) {
        console.error('Get participant sessions error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get quiz sessions'
        });
    }
});

// Join a quiz session
router.post('/sessions/:sessionId/join', authenticateParticipant, async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        // Check if session exists and is joinable
        const sessionResult = await db.query(
            'SELECT * FROM quiz_sessions WHERE id = $1 AND status IN ($2, $3)',
            [sessionId, 'scheduled', 'instruction']
        );
        
        if (sessionResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Session not found or not available for joining'
            });
        }
        
        const session = sessionResult.rows[0];
        
        // Check if already joined or submitted
        const existingResult = await db.query(
            'SELECT id, status FROM session_participants WHERE session_id = $1 AND participant_id = $2',
            [sessionId, req.user.id]
        );
        
        if (existingResult.rows.length > 0) {
            const participantStatus = existingResult.rows[0].status;
            if (participantStatus === 'submitted') {
                return res.status(400).json({
                    success: false,
                    message: 'You have already completed this quiz session'
                });
            } else {
                return res.status(400).json({
                    success: false,
                    message: 'Already joined this session'
                });
            }
        }
        
        // Check participant limit
        const countResult = await db.query(
            'SELECT COUNT(*) FROM session_participants WHERE session_id = $1',
            [sessionId]
        );
        
        const currentCount = parseInt(countResult.rows[0].count);
        if (currentCount >= session.max_participants) {
            return res.status(400).json({
                success: false,
                message: 'Session is full'
            });
        }
        
        // Join the session
        await db.query(
            'INSERT INTO session_participants (session_id, participant_id) VALUES ($1, $2)',
            [sessionId, req.user.id]
        );
        
        res.json({
            success: true,
            message: 'Successfully joined the quiz session'
        });
        
    } catch (error) {
        console.error('Join session error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to join session'
        });
    }
});

// Get quiz questions for a session
router.get('/sessions/:sessionId/questions', authenticateParticipant, checkSessionAccess, checkNotSubmitted, checkQuizState(['active']), async (req, res) => {
    try {
        const { sessionId } = req.params;
        const participantId = req.user.id;
        
        // Check if participant already has shuffled question order
        const participantResult = await db.query(`
            SELECT shuffled_question_order 
            FROM session_participants 
            WHERE session_id = $1 AND participant_id = $2
        `, [sessionId, participantId]);
        
        if (participantResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Participant not found in session'
            });
        }
        
        // Get all questions for the quiz with shuffle settings
        const questionsResult = await db.query(`
            SELECT q.id, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.question_order, q.correct_answer,
                   qz.shuffle_questions, qz.shuffle_options
            FROM questions q
            JOIN quiz_sessions qs ON q.quiz_id = qs.quiz_id
            JOIN quizzes qz ON qs.quiz_id = qz.id
            WHERE qs.id = $1
            ORDER BY q.question_order ASC
        `, [sessionId]);
        
        const originalQuestions = questionsResult.rows;
        
        if (originalQuestions.length === 0) {
            return res.json({
                success: true,
                data: []
            });
        }
        
        let shuffledData;
        
        // Check if shuffled order already exists
        if (participantResult.rows[0].shuffled_question_order) {
            // Use existing shuffle order
            const storedOrder = participantResult.rows[0].shuffled_question_order;
            
            // Reconstruct questions in shuffled order
            const shuffledQuestions = storedOrder.order.map(orderItem => {
                const question = originalQuestions.find(q => q.id === orderItem.questionId);
                if (!question) return null;
                
                // DISABLED: Answer option shuffling - ignore any stored option mappings
                // Always use original answer order even if previous shuffle data exists
                return {
                    ...question,
                    display_order: orderItem.shuffledOrder
                };
            }).filter(q => q !== null);
            
            shuffledData = {
                questions: shuffledQuestions,
                participantId,
                sessionId,
                shuffleEnabled: !!storedOrder.shuffleEnabled
            };
        } else {
            // Get shuffle settings from quiz
            const shuffleQuestions = originalQuestions.length > 0 ? originalQuestions[0].shuffle_questions : true;
            // DISABLED: Answer option shuffling - only shuffle questions, not answer options
            // const shuffleOptions = originalQuestions.length > 0 ? originalQuestions[0].shuffle_options : true;
            const shuffleOptions = false; // Always disable answer option shuffling
            
            if (shuffleQuestions) {
                // Generate new shuffle order
                shuffledData = getShuffledQuestionsForParticipant(
                    originalQuestions, 
                    participantId, 
                    sessionId, 
                    shuffleOptions
                );
            } else {
                // No shuffling - return questions in original order
                shuffledData = {
                    questions: originalQuestions.map((q, index) => ({
                        ...q,
                        display_order: q.question_order || index + 1
                    })),
                    questionOrder: originalQuestions.map((q, index) => ({
                        questionId: q.id,
                        originalOrder: q.question_order || index + 1,
                        shuffledOrder: q.question_order || index + 1
                    })),
                    participantId,
                    sessionId,
                    shuffleEnabled: false
                };
            }
            
            // Store the shuffled order in database
            const orderToStore = {
                order: shuffledData.questionOrder.map(orderItem => {
                    // DISABLED: Answer option shuffling - never store option mappings
                    return {
                        ...orderItem,
                        optionMapping: null // Always null since answer shuffling is disabled
                    };
                }),
                shuffleEnabled: shuffledData.shuffleEnabled,
                generatedAt: new Date().toISOString()
            };
            
            await db.query(`
                UPDATE session_participants 
                SET shuffled_question_order = $1 
                WHERE session_id = $2 AND participant_id = $3
            `, [JSON.stringify(orderToStore), sessionId, participantId]);
        }
        
        // Remove sensitive data before sending to client
        const clientQuestions = shuffledData.questions.map(q => ({
            id: q.id,
            question_text: q.question_text,
            option_a: q.option_a,
            option_b: q.option_b,
            option_c: q.option_c,
            option_d: q.option_d,
            display_order: q.display_order || q.question_order,
            // Don't send correct answer or mapping to client
        }));
        
        res.json({
            success: true,
            data: clientQuestions,
            shuffled: true,
            questionCount: clientQuestions.length
        });
        
    } catch (error) {
        console.error('Get questions error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get quiz questions'
        });
    }
});

// Submit answer for a question
router.post('/sessions/:sessionId/answers', authenticateParticipant, checkSessionAccess, checkNotSubmitted, checkQuizState(['active']), async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { questionId, answer, timeTaken } = req.body;
        
        if (!questionId || !answer) {
            return res.status(400).json({
                success: false,
                message: 'Question ID and answer are required'
            });
        }
        
        // Validate answer option
        if (!['a', 'b', 'c', 'd'].includes(answer.toLowerCase())) {
            return res.status(400).json({
                success: false,
                message: 'Invalid answer option'
            });
        }
        
        // Get participant's shuffled question order to map answer correctly
        const participantResult = await db.query(`
            SELECT shuffled_question_order 
            FROM session_participants 
            WHERE session_id = $1 AND participant_id = $2
        `, [sessionId, req.user.id]);
        
        if (participantResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Participant not found in session'
            });
        }
        
        // Get original question data
        const questionResult = await db.query(
            'SELECT correct_answer FROM questions WHERE id = $1',
            [questionId]
        );
        
        if (questionResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Question not found'
            });
        }
        
        let isCorrect;
        let originalAnswer = answer.toLowerCase();
        
        // DISABLED: Answer option shuffling - ignore any stored option mappings
        // Always use participant's answer directly without any mapping
        // Note: Previously this code would check for shuffled question order and map answers
        // back using stored optionMapping, but answer shuffling is now disabled so we use
        // the original answer directly
        
        const correctAnswer = questionResult.rows[0].correct_answer;
        isCorrect = originalAnswer === correctAnswer.toLowerCase();
        
        // Store answer
        await db.query(`
            INSERT INTO participant_answers 
            (session_id, participant_id, question_id, selected_answer, is_correct, time_taken_seconds)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (session_id, participant_id, question_id)
            DO UPDATE SET selected_answer = $4, is_correct = $5, time_taken_seconds = $6, answered_at = CURRENT_TIMESTAMP
        `, [sessionId, req.user.id, questionId, answer.toLowerCase(), isCorrect, Math.floor(timeTaken / 1000)]);
        
        res.json({
            success: true,
            message: 'Answer submitted successfully'
        });
        
    } catch (error) {
        console.error('Submit answer error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit answer'
        });
    }
});

// Submit quiz (final submission)
router.post('/sessions/:sessionId/submit', authenticateParticipant, checkSessionAccess, checkNotSubmitted, async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        // Check current submission status first to handle double submissions
        // Add timeout to prevent hanging
        const statusCheck = await Promise.race([
            db.query(`
                SELECT status, submitted_at 
                FROM session_participants 
                WHERE session_id = $1 AND participant_id = $2
            `, [sessionId, req.user.id]),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Query timeout')), 5000)
            )
        ]);
        
        if (statusCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Session participation not found'
            });
        }
        
        // If already submitted, return success message instead of error
        if (statusCheck.rows[0].status === 'submitted') {
            return res.json({
                success: true,
                message: 'Quiz already submitted successfully',
                submittedAt: statusCheck.rows[0].submitted_at
            });
        }
        
        // Update session participant record only if not already submitted
        // Add timeout to prevent hanging
        const result = await Promise.race([
            db.query(`
                UPDATE session_participants 
                SET submitted_at = CURRENT_TIMESTAMP, status = 'submitted'
                WHERE session_id = $1 AND participant_id = $2 AND status != 'submitted'
                RETURNING *
            `, [sessionId, req.user.id]),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Update timeout')), 5000)
            )
        ]);
        
        if (result.rows.length === 0) {
            // This could happen if someone else submitted between our check and update
            // Check again if it was submitted by a concurrent request
            const recheck = await withTimeout(
                db.query(`
                    SELECT status, submitted_at 
                    FROM session_participants 
                    WHERE session_id = $1 AND participant_id = $2
                `, [sessionId, req.user.id]),
                3000,
                'Recheck timeout'
            );
            
            if (recheck.rows.length > 0 && recheck.rows[0].status === 'submitted') {
                return res.json({
                    success: true,
                    message: 'Quiz already submitted successfully',
                    submittedAt: recheck.rows[0].submitted_at
                });
            }
            
            return res.status(404).json({
                success: false,
                message: 'Session participation not found'
            });
        }
        
        // Don't calculate individual results until session ends
        // This prevents showing incomplete rankings to early submitters
        console.log(`Participant ${req.user.id} submitted for session ${sessionId} - results will be calculated when session ends`);
        
        // IMPORTANT: Respond to user immediately before any heavy operations
        res.json({
            success: true,
            message: 'Quiz submitted successfully'
        });
        
        // Check if all participants have submitted or session has ended
        // If so, trigger prize calculation AFTER responding to user
        try {
            const sessionCheck = await withTimeout(
                db.query(`
                    SELECT qs.status, qs.max_participants, qs.prizes_calculated,
                           COUNT(sp.*) as total_participants,
                           COUNT(sp.*) FILTER (WHERE sp.status = 'submitted') as submitted_count
                    FROM quiz_sessions qs
                    LEFT JOIN session_participants sp ON qs.id = sp.session_id
                    WHERE qs.id = $1
                    GROUP BY qs.id, qs.status, qs.max_participants, qs.prizes_calculated
                `, [sessionId]),
                5000,
                'Session check timeout'
            );
            
            if (sessionCheck.rows.length > 0) {
                const session = sessionCheck.rows[0];
                const shouldCalculatePrizes = 
                    !session.prizes_calculated && 
                    (session.status === 'completed' || 
                     session.submitted_count >= session.total_participants);
                
                if (shouldCalculatePrizes) {
                    // Trigger prize calculation asynchronously WITHOUT blocking the response
                    setImmediate(async () => {
                        try {
                            console.log(`Triggering prize calculation for session ${sessionId}`);
                            await triggerPrizeCalculation(sessionId);
                            console.log(`Prize calculation completed for session ${sessionId}`);
                        } catch (error) {
                            console.error('Prize calculation trigger error for session', sessionId, ':', error);
                        }
                    });
                }
            }
        } catch (sessionCheckError) {
            // Don't let session check errors affect the submission response
            console.error('Session check error after submission for session', sessionId, ':', sessionCheckError);
        }
        
    } catch (error) {
        console.error('Submit quiz error for participant', req.user?.id, 'session', sessionId, ':', error);
        
        // Handle specific database errors
        if (error.code === '23505') { // Unique constraint violation
            return res.json({
                success: true,
                message: 'Quiz already submitted successfully'
            });
        }
        
        if (error.code === '23503') { // Foreign key constraint violation
            return res.status(404).json({
                success: false,
                message: 'Session or participant not found'
            });
        }
        
        // Handle timeout errors specifically
        if (error.message.includes('timeout')) {
            return res.status(408).json({
                success: false,
                message: 'Request timed out. Please try submitting again.'
            });
        }
        
        // Database connection or other errors
        res.status(500).json({
            success: false,
            message: 'Failed to submit quiz due to server error. Please try again.'
        });
    }
});

// Get participant results for a session
router.get('/sessions/:sessionId/results', authenticateParticipant, checkSessionAccess, async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        // First, check if session has ended
        const sessionCheck = await withTimeout(
            db.query(`
                SELECT status, end_time
                FROM quiz_sessions
                WHERE id = $1
            `, [sessionId]),
            3000,
            'Session status check timeout'
        );
        
        if (sessionCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }
        
        const session = sessionCheck.rows[0];
        
        // Only show results if session has ended
        if (session.status !== 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Results not available - session still in progress'
            });
        }
        
        let result = await withTimeout(
            db.query(`
                SELECT r.*, pw.prize_position
                FROM results r
                LEFT JOIN prize_winners pw ON r.session_id = pw.session_id AND r.participant_id = pw.participant_id
                WHERE r.session_id = $1 AND r.participant_id = $2
            `, [sessionId, req.user.id]),
            5000,
            'Results query timeout'
        );
        
        // If results don't exist for a completed session, calculate all session results
        if (result.rows.length === 0) {
            const submissionCheck = await withTimeout(
                db.query(`
                    SELECT status, submitted_at
                    FROM session_participants
                    WHERE session_id = $1 AND participant_id = $2 AND status = 'submitted'
                `, [sessionId, req.user.id]),
                3000,
                'Submission check timeout'
            );
            
            if (submissionCheck.rows.length > 0) {
                // Session is completed and participant submitted, calculate all session results with proper rankings
                try {
                    const { calculateSessionResults } = require('../utils/prizeCalculator');
                    await calculateSessionResults(sessionId);
                    
                    // Try to get results again
                    result = await withTimeout(
                        db.query(`
                            SELECT r.*, pw.prize_position
                            FROM results r
                            LEFT JOIN prize_winners pw ON r.session_id = pw.session_id AND r.participant_id = pw.participant_id
                            WHERE r.session_id = $1 AND r.participant_id = $2
                        `, [sessionId, req.user.id]),
                        5000,
                        'Results retry query timeout'
                    );
                } catch (calcError) {
                    console.error('Error calculating session results on demand:', calcError);
                }
            }
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Results not found'
                });
            }
        }
        
        // Get detailed answers
        const answersResult = await withTimeout(
            db.query(`
                SELECT pa.*, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer
                FROM participant_answers pa
                JOIN questions q ON pa.question_id = q.id
                WHERE pa.session_id = $1 AND pa.participant_id = $2
                ORDER BY q.question_order ASC
            `, [sessionId, req.user.id]),
            5000,
            'Answers query timeout'
        );
        
        res.json({
            success: true,
            data: {
                summary: result.rows[0],
                answers: answersResult.rows
            }
        });
        
    } catch (error) {
        console.error('Get results error:', error);
        
        // Handle timeout errors specifically
        if (error.message.includes('timeout')) {
            return res.status(408).json({
                success: false,
                message: 'Request timed out. Please try again.'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Failed to get results'
        });
    }
});

module.exports = router;