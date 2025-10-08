const { getShuffledQuestionsForParticipant, verifyAnswer, generateShuffleStatistics } = require('../utils/questionShuffler');

// Mock question data
const mockQuestions = [
    {
        id: 1,
        question_text: "What is 2 + 2?",
        option_a: "3",
        option_b: "4",
        option_c: "5",
        option_d: "6",
        correct_answer: "b",
        question_order: 1
    },
    {
        id: 2,
        question_text: "What is the capital of France?",
        option_a: "London",
        option_b: "Berlin",
        option_c: "Paris",
        option_d: "Madrid",
        correct_answer: "c",
        question_order: 2
    },
    {
        id: 3,
        question_text: "Which planet is closest to the Sun?",
        option_a: "Venus",
        option_b: "Mercury",
        option_c: "Earth",
        option_d: "Mars",
        correct_answer: "b",
        question_order: 3
    }
];

function testQuestionShuffling() {
    console.log('🧪 Testing Question Shuffling Functionality\n');
    
    // Test 1: Generate shuffled questions for different participants
    console.log('📊 Test 1: Question Order Shuffling');
    const participants = [];
    
    for (let i = 1; i <= 5; i++) {
        const shuffled = getShuffledQuestionsForParticipant(mockQuestions, i, 1, true);
        participants.push({
            participantId: i,
            shuffled_question_order: {
                order: shuffled.questionOrder,
                shuffleEnabled: shuffled.shuffleEnabled
            }
        });
        
        console.log(`Participant ${i}:`);
        shuffled.questions.forEach((q, index) => {
            console.log(`  ${index + 1}. Question ${q.id}: "${q.question_text.substring(0, 30)}..."`);
            console.log(`     Options: a) ${q.option_a} b) ${q.option_b} c) ${q.option_c} d) ${q.option_d}`);
            console.log(`     Correct: ${q.correct_answer} (Original: ${q.original_correct_answer || q.correct_answer})`);
        });
        console.log('');
    }
    
    // Test 2: Verify answer mapping
    console.log('✅ Test 2: Answer Verification');
    const participant1Data = getShuffledQuestionsForParticipant(mockQuestions, 1, 1, true);
    const testQuestion = participant1Data.questions[0];
    
    console.log(`Testing question: "${testQuestion.question_text}"`);
    console.log(`Shuffled options: a) ${testQuestion.option_a} b) ${testQuestion.option_b} c) ${testQuestion.option_c} d) ${testQuestion.option_d}`);
    console.log(`Correct answer in shuffled format: ${testQuestion.correct_answer}`);
    
    // Test correct answer
    const isCorrect = verifyAnswer(testQuestion.correct_answer, testQuestion);
    console.log(`Answer verification (correct): ${isCorrect ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test incorrect answer
    const wrongAnswer = testQuestion.correct_answer === 'a' ? 'b' : 'a';
    const isIncorrect = !verifyAnswer(wrongAnswer, testQuestion);
    console.log(`Answer verification (incorrect): ${isIncorrect ? '✅ PASS' : '❌ FAIL'}\n`);
    
    // Test 3: Shuffle statistics
    console.log('📈 Test 3: Shuffle Diversity');
    const stats = generateShuffleStatistics(participants);
    console.log(`Total participants: ${stats.totalParticipants}`);
    console.log(`Unique question orders: ${stats.uniqueOrderCount}`);
    console.log(`Diversity percentage: ${stats.diversityPercentage.toFixed(1)}%`);
    console.log(`Duplicate orders: ${stats.duplicateOrders}\n`);
    
    // Test 4: Consistency check
    console.log('🔄 Test 4: Consistency Check');
    const shuffle1 = getShuffledQuestionsForParticipant(mockQuestions, 999, 1, true);
    const shuffle2 = getShuffledQuestionsForParticipant(mockQuestions, 999, 1, true);
    
    const order1 = shuffle1.questions.map(q => q.id).join(',');
    const order2 = shuffle2.questions.map(q => q.id).join(',');
    
    console.log(`Same participant, same session - orders should be different due to timestamp:`);
    console.log(`First shuffle:  [${order1}]`);
    console.log(`Second shuffle: [${order2}]`);
    console.log(`Orders different: ${order1 !== order2 ? '✅ PASS' : '❌ FAIL'}\n`);
    
    // Test 5: Option shuffling verification
    console.log('🔀 Test 5: Option Shuffling Verification');
    const withOptionShuffle = getShuffledQuestionsForParticipant(mockQuestions, 123, 1, true);
    const withoutOptionShuffle = getShuffledQuestionsForParticipant(mockQuestions, 123, 1, false);
    
    console.log('With option shuffling:');
    console.log(`Q1: a) ${withOptionShuffle.questions[0].option_a} b) ${withOptionShuffle.questions[0].option_b}`);
    console.log('Without option shuffling:');
    console.log(`Q1: a) ${withoutOptionShuffle.questions[0].option_a} b) ${withoutOptionShuffle.questions[0].option_b}`);
    
    const optionsChanged = withOptionShuffle.questions[0].option_a !== withoutOptionShuffle.questions[0].option_a;
    console.log(`Options shuffled correctly: ${optionsChanged ? '✅ PASS' : '❌ FAIL'}\n`);
    
    console.log('🎉 Question Shuffling Test Complete!');
    console.log('Note: In production, each participant will get a unique question order and option arrangement.');
}

// Run tests
testQuestionShuffling();