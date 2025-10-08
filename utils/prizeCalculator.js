const db = require('../config/database');

/**
 * Calculate and assign prize winners for a quiz session
 * Winners are determined by:
 * 1. Highest score first
 * 2. Fastest completion time for ties
 * 
 * @param {number} sessionId - The quiz session ID
 * @returns {Promise<Object>} Results of prize calculation
 */
async function calculatePrizeWinners(sessionId) {
    const client = await db.getClient();
    
    try {
        await client.query('BEGIN');
        
        // First, calculate results for all participants who haven't been processed yet
        await calculateSessionResults(sessionId, client);
        
        // Get top performers for prize assignment
        const winnersResult = await client.query(`
            SELECT r.*, p.name, p.email, p.company
            FROM results r
            JOIN participants p ON r.participant_id = p.id
            WHERE r.session_id = $1
            ORDER BY r.total_score DESC, r.completion_time_seconds ASC
            LIMIT 3
        `, [sessionId]);
        
        const winners = winnersResult.rows;
        
        if (winners.length === 0) {
            await client.query('COMMIT');
            return { success: false, message: 'No participants found' };
        }
        
        // Clear existing prize winners for this session
        await client.query(
            'DELETE FROM prize_winners WHERE session_id = $1',
            [sessionId]
        );
        
        // Assign prizes
        const prizeAssignments = [];
        
        for (let i = 0; i < Math.min(winners.length, 3); i++) {
            const winner = winners[i];
            const position = i + 1;
            
            // Only assign prize if participant has a valid score
            if (winner.total_score > 0 || winner.correct_answers > 0) {
                await client.query(`
                    INSERT INTO prize_winners (session_id, participant_id, prize_position, score, completion_time_seconds)
                    VALUES ($1, $2, $3, $4, $5)
                `, [sessionId, winner.participant_id, position, winner.total_score, winner.completion_time_seconds]);
                
                prizeAssignments.push({
                    position,
                    participant: {
                        id: winner.participant_id,
                        name: winner.name,
                        email: winner.email,
                        company: winner.company
                    },
                    score: winner.total_score,
                    percentage: winner.percentage_score,
                    completionTime: winner.completion_time_seconds
                });
            }
        }
        
        await client.query('COMMIT');
        
        return {
            success: true,
            message: 'Prize winners calculated successfully',
            winners: prizeAssignments
        };
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Prize calculation error:', error);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Calculate results for all participants in a session
 * @param {number} sessionId - The quiz session ID
 * @param {Object} client - Database client (optional, for transactions)
 */
async function calculateSessionResults(sessionId, client = null) {
    const dbClient = client || db;
    
    try {
        // Get all participants who submitted but don't have results yet
        const participantsResult = await dbClient.query(`
            SELECT sp.participant_id, sp.submitted_at, qs.quiz_id,
                   EXTRACT(EPOCH FROM (sp.submitted_at - sp.joined_at)) as total_time_seconds
            FROM session_participants sp
            JOIN quiz_sessions qs ON sp.session_id = qs.id
            LEFT JOIN results r ON sp.session_id = r.session_id AND sp.participant_id = r.participant_id
            WHERE sp.session_id = $1 AND sp.status = 'submitted' AND r.id IS NULL
        `, [sessionId]);
        
        for (const participant of participantsResult.rows) {
            await calculateParticipantResult(sessionId, participant.participant_id, dbClient);
        }
        
    } catch (error) {
        console.error('Calculate session results error:', error);
        throw error;
    }
}

/**
 * Calculate individual participant results
 * @param {number} sessionId - The quiz session ID
 * @param {number} participantId - The participant ID
 * @param {Object} client - Database client (optional, for transactions)
 */
async function calculateParticipantResult(sessionId, participantId, client = null) {
    const dbClient = client || db;
    
    try {
        // Get participant answers and calculate scores
        const answersResult = await dbClient.query(`
            SELECT 
                COUNT(*) as total_answered,
                COUNT(*) FILTER (WHERE is_correct = true) as correct_answers,
                COUNT(*) FILTER (WHERE is_correct = false) as incorrect_answers,
                SUM(time_taken_seconds) as total_time_taken
            FROM participant_answers
            WHERE session_id = $1 AND participant_id = $2
        `, [sessionId, participantId]);
        
        // Get total questions in quiz
        const quizResult = await dbClient.query(`
            SELECT q.total_questions
            FROM quiz_sessions qs
            JOIN quizzes q ON qs.quiz_id = q.id
            WHERE qs.id = $1
        `, [sessionId]);
        
        // Get submission time
        const submissionResult = await dbClient.query(`
            SELECT submitted_at, joined_at,
                   EXTRACT(EPOCH FROM (submitted_at - joined_at)) as completion_time_seconds
            FROM session_participants
            WHERE session_id = $1 AND participant_id = $2
        `, [sessionId, participantId]);
        
        if (answersResult.rows.length === 0 || quizResult.rows.length === 0 || submissionResult.rows.length === 0) {
            throw new Error('Missing data for result calculation');
        }
        
        const answers = answersResult.rows[0];
        const totalQuestions = parseInt(quizResult.rows[0].total_questions);
        const submission = submissionResult.rows[0];
        
        const correctAnswers = parseInt(answers.correct_answers) || 0;
        const incorrectAnswers = parseInt(answers.incorrect_answers) || 0;
        const totalAnswered = parseInt(answers.total_answered) || 0;
        const unanswered = totalQuestions - totalAnswered;
        
        // Calculate scores
        const totalScore = correctAnswers; // 1 point per correct answer
        const percentageScore = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
        const completionTimeSeconds = Math.floor(parseFloat(submission.completion_time_seconds) || 0);
        
        // Determine performance category
        let performanceCategory = 'Needs Improvement';
        if (percentageScore >= 80) {
            performanceCategory = 'Excellent';
        } else if (percentageScore >= 60) {
            performanceCategory = 'Good';
        }
        
        // Insert or update results
        await dbClient.query(`
            INSERT INTO results (
                session_id, participant_id, total_questions, total_score, percentage_score, 
                correct_answers, incorrect_answers, unanswered,
                completion_time_seconds, performance_category
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (session_id, participant_id)
            DO UPDATE SET 
                total_questions = $3, total_score = $4, percentage_score = $5,
                correct_answers = $6, incorrect_answers = $7, unanswered = $8,
                completion_time_seconds = $9, performance_category = $10
        `, [
            sessionId, participantId, totalQuestions, totalScore, percentageScore,
            correctAnswers, incorrectAnswers, unanswered,
            completionTimeSeconds, performanceCategory
        ]);
        
        return {
            totalScore,
            percentageScore,
            correctAnswers,
            incorrectAnswers,
            unanswered,
            completionTimeSeconds,
            performanceCategory
        };
        
    } catch (error) {
        console.error('Calculate participant result error:', error);
        throw error;
    }
}

/**
 * Trigger prize calculation when a session ends or when manually triggered
 * @param {number} sessionId - The quiz session ID
 */
async function triggerPrizeCalculation(sessionId) {
    try {
        console.log(`Triggering prize calculation for session ${sessionId}`);
        
        const result = await calculatePrizeWinners(sessionId);
        
        if (result.success) {
            console.log(`Prize calculation completed for session ${sessionId}:`, result.winners);
            
            // Update session status to indicate prizes have been calculated
            await db.query(
                'UPDATE quiz_sessions SET prizes_calculated = true WHERE id = $1',
                [sessionId]
            );
        }
        
        return result;
        
    } catch (error) {
        console.error('Trigger prize calculation error:', error);
        return { success: false, message: 'Prize calculation failed', error: error.message };
    }
}

module.exports = {
    calculatePrizeWinners,
    calculateSessionResults,
    calculateParticipantResult,
    triggerPrizeCalculation
};