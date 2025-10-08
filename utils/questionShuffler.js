/**
 * Question Shuffler Utility
 * Handles randomization of questions and answer options to prevent copying
 */

/**
 * Fisher-Yates shuffle algorithm for proper randomization
 * @param {Array} array - Array to shuffle
 * @returns {Array} - Shuffled array
 */
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * Generate a unique shuffled question order for a participant
 * @param {Array} questions - Array of question objects
 * @param {number} participantId - Participant ID for seeding
 * @param {number} sessionId - Session ID for additional entropy
 * @returns {Object} - Shuffled questions with order mapping
 */
function generateShuffledQuestionOrder(questions, participantId, sessionId) {
    // Create a deterministic but unique seed based on participant and session
    const seed = `${sessionId}-${participantId}-${Date.now()}`;
    const seedrandom = require('seedrandom');
    const rng = seedrandom(seed);
    
    // Create array of question IDs with their original order
    const questionOrder = questions.map((q, index) => ({
        questionId: q.id,
        originalOrder: q.question_order || index + 1,
        shuffledOrder: index + 1
    }));
    
    // Shuffle using seeded random number generator
    for (let i = questionOrder.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [questionOrder[i], questionOrder[j]] = [questionOrder[j], questionOrder[i]];
    }
    
    // Update shuffled order
    questionOrder.forEach((item, index) => {
        item.shuffledOrder = index + 1;
    });
    
    return {
        order: questionOrder,
        shuffledQuestions: questionOrder.map(item => {
            const question = questions.find(q => q.id === item.questionId);
            return {
                ...question,
                display_order: item.shuffledOrder
            };
        })
    };
}

/**
 * Shuffle answer options within a question
 * @param {Object} question - Question object with options
 * @param {number} participantId - Participant ID for seeding
 * @returns {Object} - Question with shuffled options and correct answer mapping
 */
function shuffleQuestionOptions(question, participantId) {
    const options = [
        { key: 'a', value: question.option_a },
        { key: 'b', value: question.option_b },
        { key: 'c', value: question.option_c },
        { key: 'd', value: question.option_d }
    ];
    
    // Use participant ID and question ID for consistent shuffling
    const seed = `${participantId}-${question.id}`;
    const seedrandom = require('seedrandom');
    const rng = seedrandom(seed);
    
    // Shuffle options
    for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
    }
    
    // Create mapping of shuffled options
    const shuffledQuestion = { ...question };
    const optionMapping = {};
    
    options.forEach((option, index) => {
        const newKey = String.fromCharCode(97 + index); // 'a', 'b', 'c', 'd'
        shuffledQuestion[`option_${newKey}`] = option.value;
        optionMapping[option.key] = newKey;
    });
    
    // Update correct answer to match new option order
    shuffledQuestion.correct_answer = optionMapping[question.correct_answer];
    shuffledQuestion.original_correct_answer = question.correct_answer;
    shuffledQuestion.option_mapping = optionMapping;
    
    return shuffledQuestion;
}

/**
 * Get shuffled questions for a participant
 * @param {Array} questions - Original questions array
 * @param {number} participantId - Participant ID
 * @param {number} sessionId - Session ID
 * @param {boolean} shuffleOptions - Whether to shuffle answer options
 * @returns {Object} - Shuffled questions and order data
 */
function getShuffledQuestionsForParticipant(questions, participantId, sessionId, shuffleOptions = true) {
    // First shuffle the question order
    const { order, shuffledQuestions } = generateShuffledQuestionOrder(questions, participantId, sessionId);
    
    // Then shuffle options within each question if enabled
    const finalQuestions = shuffleOptions 
        ? shuffledQuestions.map(q => shuffleQuestionOptions(q, participantId))
        : shuffledQuestions;
    
    return {
        questions: finalQuestions,
        questionOrder: order,
        participantId,
        sessionId,
        shuffleEnabled: shuffleOptions
    };
}

/**
 * Map participant's answer back to original question structure
 * @param {string} participantAnswer - Answer given by participant (a, b, c, d)
 * @param {Object} questionData - Question data with option mapping
 * @returns {string} - Original answer key
 */
function mapAnswerToOriginal(participantAnswer, questionData) {
    if (!questionData.option_mapping) {
        return participantAnswer; // No shuffling was applied
    }
    
    // Find original key that maps to participant's answer
    for (const [originalKey, shuffledKey] of Object.entries(questionData.option_mapping)) {
        if (shuffledKey === participantAnswer) {
            return originalKey;
        }
    }
    
    return participantAnswer; // Fallback
}

/**
 * Verify answer correctness using original question structure
 * @param {string} participantAnswer - Answer given by participant
 * @param {Object} questionData - Question data with shuffling info
 * @returns {boolean} - Whether answer is correct
 */
function verifyAnswer(participantAnswer, questionData) {
    const originalAnswer = mapAnswerToOriginal(participantAnswer, questionData);
    return originalAnswer === questionData.original_correct_answer || originalAnswer === questionData.correct_answer;
}

/**
 * Generate question statistics showing shuffle effectiveness
 * @param {Array} participants - Array of participant data
 * @returns {Object} - Statistics about question order diversity
 */
function generateShuffleStatistics(participants) {
    const stats = {
        totalParticipants: participants.length,
        uniqueOrders: new Set(),
        orderDistribution: {},
        duplicateOrders: 0
    };
    
    participants.forEach(participant => {
        if (participant.shuffled_question_order) {
            const orderString = JSON.stringify(participant.shuffled_question_order);
            
            if (stats.uniqueOrders.has(orderString)) {
                stats.duplicateOrders++;
            } else {
                stats.uniqueOrders.add(orderString);
            }
            
            stats.orderDistribution[orderString] = (stats.orderDistribution[orderString] || 0) + 1;
        }
    });
    
    stats.uniqueOrderCount = stats.uniqueOrders.size;
    stats.diversityPercentage = (stats.uniqueOrderCount / stats.totalParticipants) * 100;
    
    return stats;
}

module.exports = {
    shuffleArray,
    generateShuffledQuestionOrder,
    shuffleQuestionOptions,
    getShuffledQuestionsForParticipant,
    mapAnswerToOriginal,
    verifyAnswer,
    generateShuffleStatistics
};