const jwt = require('jsonwebtoken');
const { redisHelper } = require('../config/redis');
const db = require('../config/database');

// Store active connections
const activeConnections = new Map();
const sessionRooms = new Map();

const socketHandlers = {
    initializeHandlers: (socket, io) => {
        // Authenticate socket connection
        socket.on('authenticate', async (data) => {
            try {
                const { token, userType } = data;
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                
                socket.userId = decoded.id;
                socket.userType = userType; // 'participant' or 'admin'
                socket.authenticated = true;
                
                activeConnections.set(socket.id, {
                    userId: decoded.id,
                    userType: userType,
                    socketId: socket.id
                });
                
                socket.emit('authenticated', { success: true });
                console.log(`${userType} authenticated: ${decoded.id}`);
                
            } catch (error) {
                socket.emit('authentication_error', { message: 'Invalid token' });
                console.error('Socket authentication error:', error.message);
            }
        });
        
        // Join quiz session
        socket.on('join_session', async (data) => {
            try {
                if (!socket.authenticated) {
                    socket.emit('error', { message: 'Not authenticated' });
                    return;
                }
                
                const { sessionId } = data;
                
                // Verify session exists and is active
                const sessionResult = await db.query(
                    'SELECT * FROM quiz_sessions WHERE id = $1',
                    [sessionId]
                );
                
                if (sessionResult.rows.length === 0) {
                    socket.emit('error', { message: 'Session not found' });
                    return;
                }
                
                const session = sessionResult.rows[0];
                
                // Join socket room
                socket.join(`session_${sessionId}`);
                socket.currentSession = sessionId;
                
                // Track participant in Redis
                if (socket.userType === 'participant') {
                    await redisHelper.addParticipantToSession(sessionId, socket.userId);
                    
                    // Update participant count
                    const participantCount = await redisHelper.getSessionParticipants(sessionId);
                    
                    // Broadcast updated participant count
                    io.to(`session_${sessionId}`).emit('participant_count', {
                        count: participantCount.length,
                        maxParticipants: session.max_participants
                    });
                }
                
                socket.emit('session_joined', {
                    sessionId: sessionId,
                    session: session
                });
                
                console.log(`User ${socket.userId} joined session ${sessionId}`);
                
            } catch (error) {
                socket.emit('error', { message: 'Failed to join session' });
                console.error('Join session error:', error.message);
            }
        });
        
        // Handle quiz start
        socket.on('start_quiz', async (data) => {
            try {
                if (!socket.authenticated || socket.userType !== 'participant') {
                    socket.emit('error', { message: 'Unauthorized' });
                    return;
                }
                
                const { sessionId } = data;
                
                // Record quiz start time
                await db.query(
                    `UPDATE session_participants 
                     SET started_quiz_at = CURRENT_TIMESTAMP, status = 'started'
                     WHERE session_id = $1 AND participant_id = $2`,
                    [sessionId, socket.userId]
                );
                
                // Initialize quiz state in Redis
                const quizState = {
                    currentQuestion: 1,
                    answers: {},
                    startTime: Date.now(),
                    timeRemaining: 15 * 60 * 1000 // 15 minutes in milliseconds
                };
                
                await redisHelper.setQuizState(sessionId, socket.userId, quizState);
                
                socket.emit('quiz_started', { startTime: Date.now() });
                
            } catch (error) {
                socket.emit('error', { message: 'Failed to start quiz' });
                console.error('Start quiz error:', error.message);
            }
        });
        
        // Handle answer submission
        socket.on('submit_answer', async (data) => {
            try {
                if (!socket.authenticated || socket.userType !== 'participant') {
                    socket.emit('error', { message: 'Unauthorized' });
                    return;
                }
                
                const { sessionId, questionId, answer, timeTaken } = data;
                
                // Get current quiz state
                const quizState = await redisHelper.getQuizState(sessionId, socket.userId);
                if (!quizState) {
                    socket.emit('error', { message: 'Quiz state not found' });
                    return;
                }
                
                // Get correct answer
                const questionResult = await db.query(
                    'SELECT correct_answer FROM questions WHERE id = $1',
                    [questionId]
                );
                
                if (questionResult.rows.length === 0) {
                    socket.emit('error', { message: 'Question not found' });
                    return;
                }
                
                const correctAnswer = questionResult.rows[0].correct_answer;
                const isCorrect = answer === correctAnswer;
                
                // Store answer in database
                await db.query(
                    `INSERT INTO participant_answers 
                     (session_id, participant_id, question_id, selected_answer, is_correct, time_taken_seconds)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     ON CONFLICT (session_id, participant_id, question_id)
                     DO UPDATE SET selected_answer = $4, is_correct = $5, time_taken_seconds = $6, answered_at = CURRENT_TIMESTAMP`,
                    [sessionId, socket.userId, questionId, answer, isCorrect, Math.floor(timeTaken / 1000)]
                );
                
                // Update quiz state in Redis
                quizState.answers[questionId] = {
                    answer: answer,
                    isCorrect: isCorrect,
                    timeTaken: timeTaken
                };
                
                await redisHelper.setQuizState(sessionId, socket.userId, quizState);
                
                socket.emit('answer_submitted', {
                    questionId: questionId,
                    success: true
                });
                
            } catch (error) {
                socket.emit('error', { message: 'Failed to submit answer' });
                console.error('Submit answer error:', error.message);
            }
        });
        
        // Handle quiz navigation
        socket.on('navigate_question', async (data) => {
            try {
                if (!socket.authenticated || socket.userType !== 'participant') {
                    socket.emit('error', { message: 'Unauthorized' });
                    return;
                }
                
                const { sessionId, questionNumber } = data;
                
                // Update current question in Redis
                const quizState = await redisHelper.getQuizState(sessionId, socket.userId);
                if (quizState) {
                    quizState.currentQuestion = questionNumber;
                    await redisHelper.setQuizState(sessionId, socket.userId, quizState);
                }
                
                socket.emit('question_navigated', { currentQuestion: questionNumber });
                
            } catch (error) {
                socket.emit('error', { message: 'Navigation failed' });
                console.error('Navigate question error:', error.message);
            }
        });
        
        // Handle quiz submission
        socket.on('submit_quiz', async (data) => {
            try {
                if (!socket.authenticated || socket.userType !== 'participant') {
                    socket.emit('error', { message: 'Unauthorized' });
                    return;
                }
                
                const { sessionId } = data;
                
                // Get quiz state
                const quizState = await redisHelper.getQuizState(sessionId, socket.userId);
                if (!quizState) {
                    socket.emit('error', { message: 'Quiz state not found' });
                    return;
                }
                
                const completionTime = Date.now() - quizState.startTime;
                
                // Update session participant record
                await db.query(
                    `UPDATE session_participants 
                     SET submitted_at = CURRENT_TIMESTAMP, completion_time_seconds = $1, status = 'submitted'
                     WHERE session_id = $2 AND participant_id = $3`,
                    [Math.floor(completionTime / 1000), sessionId, socket.userId]
                );
                
                // Calculate results
                const resultsData = await calculateResults(sessionId, socket.userId);
                
                socket.emit('quiz_submitted', {
                    completionTime: completionTime,
                    results: resultsData
                });
                
                // Check and announce prize winners
                await checkAndAnnouncePrizeWinners(sessionId, io);
                
            } catch (error) {
                socket.emit('error', { message: 'Failed to submit quiz' });
                console.error('Submit quiz error:', error.message);
            }
        });
        
        // Admin controls
        socket.on('admin_start_session', async (data) => {
            if (!socket.authenticated || socket.userType !== 'admin') {
                socket.emit('error', { message: 'Unauthorized' });
                return;
            }
            
            const { sessionId } = data;
            
            // Update session status using scheduled start time
            await db.query(
                'UPDATE quiz_sessions SET status = $1, instruction_start_time = start_time WHERE id = $2',
                ['instruction', sessionId]
            );
            
            // Broadcast to all participants in session
            io.to(`session_${sessionId}`).emit('session_instruction_started', {
                instructionTime: 5 * 60 * 1000 // 5 minutes
            });
        });
        
        socket.on('admin_start_quiz_timer', async (data) => {
            if (!socket.authenticated || socket.userType !== 'admin') {
                socket.emit('error', { message: 'Unauthorized' });
                return;
            }
            
            const { sessionId } = data;
            
            // Update session status using calculated instruction end time
            await db.query(
                'UPDATE quiz_sessions SET status = $1, quiz_start_time = instruction_start_time + INTERVAL \'1 minute\' * COALESCE((SELECT instruction_time_minutes FROM quizzes WHERE id = quiz_id), 5) WHERE id = $2',
                ['active', sessionId]
            );
            
            // Set timer in Redis
            const timerData = {
                startTime: Date.now(),
                duration: 15 * 60 * 1000, // 15 minutes
                sessionId: sessionId
            };
            
            await redisHelper.setTimer(sessionId, timerData);
            
            // Broadcast quiz start to all participants
            io.to(`session_${sessionId}`).emit('quiz_timer_started', {
                startTime: Date.now(),
                duration: 15 * 60 * 1000
            });
            
            // Set auto-submit timer
            setTimeout(async () => {
                await handleAutoSubmit(sessionId, io);
            }, 15 * 60 * 1000);
        });
    },
    
    handleDisconnect: async (socket, io) => {
        if (socket.currentSession && socket.userType === 'participant') {
            // Remove participant from Redis tracking
            await redisHelper.removeParticipantFromSession(socket.currentSession, socket.userId);
            
            // Update participant count
            const participantCount = await redisHelper.getSessionParticipants(socket.currentSession);
            
            // Broadcast updated count
            io.to(`session_${socket.currentSession}`).emit('participant_count', {
                count: participantCount.length
            });
        }
        
        activeConnections.delete(socket.id);
    }
};

// Helper functions
async function calculateResults(sessionId, participantId) {
    try {
        // Get session details
        const sessionResult = await db.query(
            'SELECT * FROM quiz_sessions qs JOIN quizzes q ON qs.quiz_id = q.id WHERE qs.id = $1',
            [sessionId]
        );
        
        if (sessionResult.rows.length === 0) {
            throw new Error('Session not found');
        }
        
        const session = sessionResult.rows[0];
        
        // Get participant answers
        const answersResult = await db.query(
            'SELECT * FROM participant_answers WHERE session_id = $1 AND participant_id = $2',
            [sessionId, participantId]
        );
        
        const answers = answersResult.rows;
        const totalQuestions = session.total_questions;
        const correctAnswers = answers.filter(a => a.is_correct).length;
        const incorrectAnswers = answers.filter(a => !a.is_correct).length;
        const unanswered = totalQuestions - answers.length;
        const percentageScore = (correctAnswers / totalQuestions) * 100;
        
        // Get completion time
        const participantResult = await db.query(
            'SELECT completion_time_seconds FROM session_participants WHERE session_id = $1 AND participant_id = $2',
            [sessionId, participantId]
        );
        
        const completionTimeSeconds = participantResult.rows[0]?.completion_time_seconds || 0;
        
        // Determine performance category
        let performanceCategory = 'Needs Improvement';
        if (percentageScore >= 80) performanceCategory = 'Excellent';
        else if (percentageScore >= 60) performanceCategory = 'Good';
        
        // Store results
        await db.query(
            `INSERT INTO results 
             (session_id, participant_id, total_questions, correct_answers, incorrect_answers, 
              unanswered, total_score, percentage_score, completion_time_seconds, performance_category)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (session_id, participant_id)
             DO UPDATE SET correct_answers = $4, incorrect_answers = $5, unanswered = $6,
                          total_score = $7, percentage_score = $8, completion_time_seconds = $9,
                          performance_category = $10`,
            [sessionId, participantId, totalQuestions, correctAnswers, incorrectAnswers,
             unanswered, correctAnswers, percentageScore, completionTimeSeconds, performanceCategory]
        );
        
        return {
            totalQuestions,
            correctAnswers,
            incorrectAnswers,
            unanswered,
            percentageScore,
            completionTimeSeconds,
            performanceCategory
        };
        
    } catch (error) {
        console.error('Calculate results error:', error);
        throw error;
    }
}

async function checkAndAnnouncePrizeWinners(sessionId, io) {
    try {
        // Get top 3 performers
        const winnersResult = await db.query(
            `SELECT r.*, p.name, p.email 
             FROM results r 
             JOIN participants p ON r.participant_id = p.id 
             WHERE r.session_id = $1 
             ORDER BY r.total_score DESC, r.completion_time_seconds ASC 
             LIMIT 3`,
            [sessionId]
        );
        
        const winners = winnersResult.rows;
        
        if (winners.length >= 1) {
            // First prize winner
            await db.query(
                `INSERT INTO prize_winners (session_id, participant_id, prize_position, score, completion_time_seconds)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (session_id, prize_position) DO NOTHING`,
                [sessionId, winners[0].participant_id, 1, winners[0].total_score, winners[0].completion_time_seconds]
            );
        }
        
        if (winners.length >= 2) {
            // Second prize winner
            await db.query(
                `INSERT INTO prize_winners (session_id, participant_id, prize_position, score, completion_time_seconds)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (session_id, prize_position) DO NOTHING`,
                [sessionId, winners[1].participant_id, 2, winners[1].total_score, winners[1].completion_time_seconds]
            );
        }
        
        if (winners.length >= 3) {
            // Third prize winner
            await db.query(
                `INSERT INTO prize_winners (session_id, participant_id, prize_position, score, completion_time_seconds)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (session_id, prize_position) DO NOTHING`,
                [sessionId, winners[2].participant_id, 3, winners[2].total_score, winners[2].completion_time_seconds]
            );
        }
        
        // Broadcast prize winners
        io.to(`session_${sessionId}`).emit('prize_winners_announced', {
            winners: winners.map((winner, index) => ({
                position: index + 1,
                name: winner.name,
                score: winner.total_score,
                completionTime: winner.completion_time_seconds,
                prize: index === 0 ? '🥇 First Prize' : index === 1 ? '🥈 Second Prize' : '🥉 Third Prize'
            }))
        });
        
    } catch (error) {
        console.error('Check prize winners error:', error);
    }
}

async function handleAutoSubmit(sessionId, io) {
    try {
        // Get all participants who haven't submitted
        const pendingParticipants = await db.query(
            `SELECT participant_id FROM session_participants 
             WHERE session_id = $1 AND status = 'started'`,
            [sessionId]
        );
        
        // Auto-submit for all pending participants
        for (const participant of pendingParticipants.rows) {
            await db.query(
                `UPDATE session_participants 
                 SET submitted_at = CURRENT_TIMESTAMP, completion_time_seconds = 900, status = 'timeout'
                 WHERE session_id = $1 AND participant_id = $2`,
                [sessionId, participant.participant_id]
            );
            
            // Don't calculate individual results here - will calculate all together after session ends
        }
        
        // Update session status
        await db.query(
            'UPDATE quiz_sessions SET status = $1, end_time = CURRENT_TIMESTAMP WHERE id = $2',
            ['completed', sessionId]
        );
        
        // Calculate results for all participants now that session has ended
        try {
            const { calculateSessionResults, calculatePrizeWinners } = require('../utils/prizeCalculator');
            console.log(`Session ${sessionId} auto-ended due to timeout - calculating all results and prize winners`);
            
            // Calculate all participant results with proper rankings
            await calculateSessionResults(sessionId);
            
            // Calculate and assign prize winners
            await calculatePrizeWinners(sessionId);
            
            console.log(`Results and prize winners calculated for auto-ended session ${sessionId}`);
        } catch (calcError) {
            console.error('Error calculating results when session auto-ended:', calcError);
            // Don't fail the auto-submit if result calculation fails
        }
        
        // Broadcast quiz completion
        io.to(`session_${sessionId}`).emit('quiz_completed', {
            reason: 'timeout',
            message: 'Quiz time has expired. All answers have been auto-submitted.'
        });
        
        // Announce final prize winners (this will use the newly calculated results)
        await checkAndAnnouncePrizeWinners(sessionId, io);
        
    } catch (error) {
        console.error('Auto-submit error:', error);
    }
}

module.exports = socketHandlers;