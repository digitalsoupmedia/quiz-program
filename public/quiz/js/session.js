// Quiz session functionality
let sessionId = new URLSearchParams(window.location.search).get('sessionId') || localStorage.getItem('currentSessionId');
let questions = [];
let currentQuestionIndex = 0;
let answers = {};
let timerInterval = null;
let sessionStatus = 'waiting';
let quizStartTime = null;
let totalQuizTime = 15 * 60; // 15 minutes in seconds
let remainingTime = totalQuizTime;
let instructionTime = 5 * 60; // 5 minutes in seconds
let pollingInterval = 15000; // Start with 15 seconds
let maxPollingInterval = 60000; // Max 60 seconds
let pollingTimeoutId = null;

// Initialize session on page load
// Server-side authentication is handled by middleware, so if we reach this page, we're authenticated
document.addEventListener('DOMContentLoaded', function() {
    if (!sessionId) {
        window.location.href = '/quiz/dashboard.html';
        return;
    }
    
    initializeSession();
});

// Initialize quiz session
async function initializeSession() {
    try {
        // Get initial status and time info for proper timer setup
        const statusData = await checkSessionStatus();
        
        if (sessionStatus === 'instruction') {
            showInstructionPhase(statusData?.timeInfo);
        } else if (sessionStatus === 'active') {
            if (questions.length === 0) {
                await loadQuestions();
            }
            showQuizPhase(statusData?.timeInfo);
        } else {
            showWaitingPhase();
        }
        
        // Start polling session status with progressive intervals
        startSessionPolling();
        
    } catch (error) {
        console.error('Initialize session error:', error);
        showError('Failed to initialize quiz session');
    }
}

// Check session status
async function checkSessionStatus() {
    try {
        const response = await fetch(`/api/quiz/session/${sessionId}/status`, {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        // Handle rate limiting
        if (response.status === 429) {
            console.warn('Rate limited - reducing polling frequency');
            return;
        }
        
        // If response status indicates authentication failure, let server handle redirect
        if (response.status === 401 || response.status === 403) {
            console.log('Authentication failed while checking session status, server will handle redirect');
            return;
        }
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            const session = data.data.session;
            const timeInfo = data.data.timeInfo;
            
            sessionStatus = session.status;
            
            // Update session title
            document.getElementById('sessionTitle').textContent = session.session_name;
            
            // Handle phase transitions
            if (sessionStatus === 'instruction' && document.getElementById('instructionPhase').classList.contains('hidden')) {
                showInstructionPhase(timeInfo);
            } else if (sessionStatus === 'active' && document.getElementById('quizPhase').classList.contains('hidden')) {
                if (questions.length === 0) {
                    await loadQuestions();
                }
                showQuizPhase(timeInfo);
            } else if (sessionStatus === 'active' && !document.getElementById('quizPhase').classList.contains('hidden')) {
                // Update timer if already in quiz phase (for page reloads or status updates)
                if (timeInfo && timeInfo.remainingTime !== undefined) {
                    startQuizTimer(timeInfo.remainingTime);
                }
            }
            
            return data.data;
        }
    } catch (error) {
        console.error('Check session status error:', error);
    }
}

// Show instruction phase
function showInstructionPhase(timeInfo = null) {
    document.getElementById('waitingPhase').classList.add('hidden');
    document.getElementById('quizPhase').classList.add('hidden');
    document.getElementById('instructionPhase').classList.remove('hidden');
    
    // Update instruction question count (use default if questions not loaded yet)
    document.getElementById('instructionQuestionCount').textContent = questions.length || '30';
    
    // Start instruction timer with server time if available
    if (timeInfo && timeInfo.remainingTime !== undefined && timeInfo.remainingTime !== null) {
        startInstructionTimer(timeInfo.remainingTime);
    } else {
        startInstructionTimer();
    }
}

// Show quiz phase
function showQuizPhase(timeInfo = null) {
    document.getElementById('waitingPhase').classList.add('hidden');
    document.getElementById('instructionPhase').classList.add('hidden');
    document.getElementById('quizPhase').classList.remove('hidden');
    
    if (questions.length > 0) {
        displayQuestion(currentQuestionIndex);
        updateProgress();
    }
    
    // Start timer with server time if available (for page reloads)
    if (timeInfo && timeInfo.remainingTime !== undefined) {
        startQuizTimer(timeInfo.remainingTime);
    }
}

// Show waiting phase
function showWaitingPhase() {
    document.getElementById('instructionPhase').classList.add('hidden');
    document.getElementById('quizPhase').classList.add('hidden');
    document.getElementById('waitingPhase').classList.remove('hidden');
}

// Start instruction timer
function startInstructionTimer(remainingTimeMs = null) {
    // Clear any existing timer
    if (timerInterval) {
        clearInterval(timerInterval);
    }
    
    let timeLeft;
    if (remainingTimeMs !== null && remainingTimeMs !== undefined) {
        timeLeft = Math.max(0, Math.floor(remainingTimeMs / 1000));
        // If server says instruction phase is over (0 time), just show 0 and wait for transition
        if (timeLeft === 0) {
            document.getElementById('timerMinutes').textContent = '0';
            document.getElementById('timerSeconds').textContent = '00';
            document.getElementById('timerCircle').style.setProperty('--progress', '100%');
            return;
        }
    } else {
        timeLeft = instructionTime;
    }
    
    const originalTime = Math.max(timeLeft, instructionTime); // Use max for progress calculation
    
    const updateTimer = () => {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        
        document.getElementById('timerMinutes').textContent = minutes;
        document.getElementById('timerSeconds').textContent = seconds.toString().padStart(2, '0');
        
        const progress = ((originalTime - timeLeft) / originalTime) * 100;
        document.getElementById('timerCircle').style.setProperty('--progress', `${Math.max(0, Math.min(100, progress))}%`);
        
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            // Instruction phase ended - wait for server to transition to active phase through normal polling
            document.getElementById('timerMinutes').textContent = '0';
            document.getElementById('timerSeconds').textContent = '00';
        } else {
            timeLeft--;
        }
    };
    
    timerInterval = setInterval(updateTimer, 1000);
    updateTimer();
}

// Start quiz timer
function startQuizTimer(remainingTimeMs = null) {
    // Clear any existing timer
    if (timerInterval) {
        clearInterval(timerInterval);
    }
    
    // Calculate remaining time - prioritize server time over default
    if (remainingTimeMs !== null && remainingTimeMs !== undefined) {
        remainingTime = Math.max(0, Math.floor(remainingTimeMs / 1000));
    } else {
        remainingTime = totalQuizTime;
    }
    
    // Ensure we have valid time
    if (remainingTime <= 0) {
        console.warn('Timer has no remaining time, auto-submitting');
        autoSubmitQuiz();
        return;
    }
    
    const originalTime = Math.max(remainingTime, totalQuizTime); // Use max for progress calculation
    
    const updateTimer = () => {
        const minutes = Math.floor(remainingTime / 60);
        const seconds = remainingTime % 60;
        
        document.getElementById('timerMinutes').textContent = minutes;
        document.getElementById('timerSeconds').textContent = seconds.toString().padStart(2, '0');
        
        const progress = ((originalTime - remainingTime) / originalTime) * 100;
        document.getElementById('timerCircle').style.setProperty('--progress', `${Math.max(0, Math.min(100, progress))}%`);
        
        // Warning state for last minute
        const timerCircle = document.getElementById('timerCircle');
        const progressFill = document.getElementById('progressFill');
        
        if (remainingTime <= 60) {
            timerCircle.classList.add('timer-warning');
            if (progressFill) progressFill.classList.add('warning');
        }
        
        if (remainingTime <= 0) {
            clearInterval(timerInterval);
            autoSubmitQuiz();
        } else {
            remainingTime--;
        }
    };
    
    timerInterval = setInterval(updateTimer, 1000);
    updateTimer();
}

// Start quiz from instruction phase
async function startQuiz() {
    // First check if the session is actually in active phase
    const statusData = await checkSessionStatus();
    
    if (sessionStatus !== 'active') {
        console.log('Quiz not yet active, staying in instruction phase');
        // Don't transition to quiz phase yet, server will handle the transition
        return;
    }
    
    // Session is active, load questions and show quiz phase
    if (questions.length === 0) {
        await loadQuestions();
    }
    
    showQuizPhase(statusData?.timeInfo);
}

// Load questions from API
async function loadQuestions() {
    try {
        const response = await fetch(`/api/participant/sessions/${sessionId}/questions`, {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            questions = data.data;
            document.getElementById('totalQuestions').textContent = questions.length;
            return questions;
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        console.error('Load questions error:', error);
        showError('Failed to load quiz questions');
        return [];
    }
}

// Display current question
function displayQuestion(index) {
    if (!questions[index]) return;
    
    const question = questions[index];
    currentQuestionIndex = index;
    
    // Update question text
    document.getElementById('questionText').textContent = question.question_text;
    document.getElementById('currentQuestionNumber').textContent = index + 1;
    
    // Create options
    const options = [
        { key: 'a', text: question.option_a },
        { key: 'b', text: question.option_b },
        { key: 'c', text: question.option_c },
        { key: 'd', text: question.option_d }
    ];
    
    const container = document.getElementById('optionsContainer');
    container.innerHTML = options.map(option => `
        <div class="option-card ${answers[question.id] === option.key ? 'selected' : ''}" 
             onclick="selectOption('${question.id}', '${option.key}')">
            <div class="flex items-center">
                <div class="w-8 h-8 rounded-full border-2 border-gray-300 flex items-center justify-center mr-4 ${answers[question.id] === option.key ? 'border-gray-900 bg-gray-900' : ''}">
                    ${answers[question.id] === option.key ? '<i class="fas fa-check text-white text-sm"></i>' : `<span class="font-semibold text-gray-600">${option.key.toUpperCase()}</span>`}
                </div>
                <span class="text-gray-900">${option.text}</span>
            </div>
        </div>
    `).join('');
    
    // Update navigation buttons
    updateNavigationButtons();
    updateProgress();
}

// Select an option
async function selectOption(questionId, optionKey) {
    answers[questionId] = optionKey;
    
    // Update UI
    displayQuestion(currentQuestionIndex);
    
    // Submit answer to backend
    try {
        const timeTaken = Date.now() - quizStartTime;
        await fetch(`/api/participant/sessions/${sessionId}/answers`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                questionId: parseInt(questionId),
                answer: optionKey,
                timeTaken: timeTaken
            })
        });
    } catch (error) {
        console.error('Submit answer error:', error);
    }
}

// Navigation functions
function nextQuestion() {
    if (currentQuestionIndex < questions.length - 1) {
        displayQuestion(currentQuestionIndex + 1);
    }
}

function previousQuestion() {
    if (currentQuestionIndex > 0) {
        displayQuestion(currentQuestionIndex - 1);
    }
}

function goToQuestion(index) {
    if (index >= 0 && index < questions.length) {
        displayQuestion(index);
        closeQuestionNav();
    }
}

// Update navigation buttons
function updateNavigationButtons() {
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const submitBtn = document.getElementById('submitBtn');
    
    prevBtn.disabled = currentQuestionIndex === 0;
    
    if (currentQuestionIndex === questions.length - 1) {
        nextBtn.textContent = 'Finish';
        nextBtn.onclick = showSubmitConfirm;
    } else {
        nextBtn.innerHTML = 'Next<i class="fas fa-chevron-right ml-2"></i>';
        nextBtn.onclick = nextQuestion;
    }
}

// Update progress
function updateProgress() {
    const answered = Object.keys(answers).length;
    const total = questions.length;
    const progress = (answered / total) * 100;
    
    document.getElementById('progressFill').style.width = `${progress}%`;
}

// Question navigation modal
function showQuestionNav() {
    const grid = document.getElementById('questionNavGrid');
    
    grid.innerHTML = questions.map((question, index) => {
        const isAnswered = answers[question.id] !== undefined;
        const isCurrent = index === currentQuestionIndex;
        
        let className = 'question-nav-item ';
        if (isCurrent) {
            className += 'current';
        } else if (isAnswered) {
            className += 'answered';
        } else {
            className += 'unanswered';
        }
        
        return `
            <div class="${className}" onclick="goToQuestion(${index})">
                ${index + 1}
            </div>
        `;
    }).join('');
    
    document.getElementById('questionNavModal').classList.remove('hidden');
}

function closeQuestionNav() {
    document.getElementById('questionNavModal').classList.add('hidden');
}

// Submit confirmation modal
function showSubmitConfirm() {
    const answered = Object.keys(answers).length;
    const unanswered = questions.length - answered;
    
    const summary = `
        <div class="grid grid-cols-2 gap-4">
            <div class="text-center">
                <div class="text-xl font-bold text-gray-900">${answered}</div>
                <div class="text-xs text-gray-600">Answered</div>
            </div>
            <div class="text-center">
                <div class="text-xl font-bold text-gray-600">${unanswered}</div>
                <div class="text-xs text-gray-600">Unanswered</div>
            </div>
        </div>
        ${unanswered > 0 ? `<div class="mt-3 text-xs text-yellow-600 text-center"><i class="fas fa-exclamation-triangle mr-1"></i>You have ${unanswered} unanswered questions</div>` : ''}
    `;
    
    document.getElementById('submitSummary').innerHTML = summary;
    document.getElementById('submitModal').classList.remove('hidden');
}

function closeSubmitModal() {
    document.getElementById('submitModal').classList.add('hidden');
}

// Submit quiz
async function submitQuiz() {
    try {
        document.getElementById('finalSubmitBtn').disabled = true;
        document.getElementById('finalSubmitBtn').innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Submitting...';
        
        const response = await fetch(`/api/participant/sessions/${sessionId}/submit`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            clearInterval(timerInterval);
            window.location.href = `/quiz/results.html?sessionId=${sessionId}`;
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        console.error('Submit quiz error:', error);
        showError('Failed to submit quiz');
        document.getElementById('finalSubmitBtn').disabled = false;
        document.getElementById('finalSubmitBtn').textContent = 'Submit Now';
    }
}

// Auto submit when time expires
async function autoSubmitQuiz() {
    await submitQuiz();
}

// Exit confirmation modal
function showExitConfirm() {
    document.getElementById('exitModal').classList.remove('hidden');
}

function closeExitModal() {
    document.getElementById('exitModal').classList.add('hidden');
}

function exitQuiz() {
    clearInterval(timerInterval);
    window.location.href = '/quiz/dashboard.html';
}

// Show error message
function showError(message) {
    // Simple alert for now - could be enhanced with toast notifications
    alert(message);
}

// Prevent page refresh/back during quiz
window.addEventListener('beforeunload', function(e) {
    if (sessionStatus === 'active') {
        e.preventDefault();
        e.returnValue = '';
    }
});

// Prevent back button during quiz
window.addEventListener('popstate', function(e) {
    if (sessionStatus === 'active') {
        e.preventDefault();
        history.pushState(null, '', window.location.href);
        showExitConfirm();
    }
});

// Smart polling system with exponential backoff
function startSessionPolling() {
    pollingTimeoutId = setTimeout(async () => {
        try {
            const result = await checkSessionStatus();
            
            // Reset polling interval on success
            pollingInterval = 15000;
            
            // Adjust polling frequency based on session status
            if (sessionStatus === 'active') {
                pollingInterval = 20000; // Less frequent during active quiz
            } else if (sessionStatus === 'instruction') {
                pollingInterval = 10000; // More frequent during instruction
            } else {
                pollingInterval = 30000; // Less frequent for waiting/completed
            }
            
        } catch (error) {
            // Exponential backoff on error
            pollingInterval = Math.min(pollingInterval * 1.5, maxPollingInterval);
            console.warn(`Polling error, increasing interval to ${pollingInterval}ms`);
        }
        
        // Continue polling
        startSessionPolling();
        
    }, pollingInterval);
}

// Stop session polling when leaving
function stopSessionPolling() {
    if (pollingTimeoutId) {
        clearTimeout(pollingTimeoutId);
        pollingTimeoutId = null;
    }
}

// Clean up on page unload
window.addEventListener('beforeunload', function() {
    stopSessionPolling();
    if (timerInterval) {
        clearInterval(timerInterval);
    }
});