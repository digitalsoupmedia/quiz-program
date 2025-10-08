// Results page functionality
let sessionId = new URLSearchParams(window.location.search).get('sessionId') || localStorage.getItem('resultSessionId');
let resultsData = null;

// Initialize results page
// Server-side authentication is handled by middleware, so if we reach this page, we're authenticated
document.addEventListener('DOMContentLoaded', function() {
    if (!sessionId) {
        window.location.href = '/quiz/dashboard.html';
        return;
    }
    
    loadResults();
});

// Load participant results with retry logic
async function loadResults(retryCount = 0) {
    try {
        // On first load, show session waiting message by default
        if (retryCount === 0) {
            showWaitingMessage('Quiz session is still in progress. Your results will be available when the session ends.');
        }
        
        const response = await fetch(`/api/participant/sessions/${sessionId}/results`, {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        // If response status indicates authentication failure, let server handle redirect
        if (response.status === 401 || response.status === 403) {
            console.log('Authentication failed while loading results, server will handle redirect');
            return;
        }
        
        // Handle session still in progress (400 status)
        if (response.status === 400) {
            const data = await response.json();
            if (data.message === 'Results not available - session still in progress' && retryCount < 20) {
                console.log(`Quiz session still in progress, checking again in 5 seconds... (attempt ${retryCount + 1}/20)`);
                showWaitingMessage('Quiz session is still in progress. Your results will be available when the session ends.');
                setTimeout(() => loadResults(retryCount + 1), 5000);
                return;
            }
        }
        
        const data = await response.json();
        
        if (data.success) {
            resultsData = data.data;
            hideWaitingMessage();
            displayResults();
        } else if (data.message === 'Results not found' && retryCount < 5) {
            // Results not calculated yet, retry after 3 seconds
            console.log(`Results not ready yet, retrying in 3 seconds... (attempt ${retryCount + 1}/5)`);
            setTimeout(() => loadResults(retryCount + 1), 3000);
            return;
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        if (error.message === 'Results not found' && retryCount < 5) {
            // Results not calculated yet, retry after 3 seconds
            console.log(`Results not ready yet, retrying in 3 seconds... (attempt ${retryCount + 1}/5)`);
            setTimeout(() => loadResults(retryCount + 1), 3000);
            return;
        }
        
        if (error.message === 'Results not available - session still in progress' && retryCount < 20) {
            console.log(`Quiz session still in progress, checking again in 5 seconds... (attempt ${retryCount + 1}/20)`);
            showWaitingMessage('Quiz session is still in progress. Your results will be available when the session ends.');
            setTimeout(() => loadResults(retryCount + 1), 5000);
            return;
        }
        
        console.error('Load results error:', error);
        showError('Failed to load quiz results. Your submission was recorded but results are still being processed.');
    } finally {
        // Only hide loading if we successfully got results
        if (resultsData) {
            showLoading(false);
        }
    }
}

// Display results
function displayResults() {
    const { summary, answers } = resultsData;
    
    // Show results content
    document.getElementById('resultsContent').classList.remove('hidden');
    
    // Update congratulations message
    updateCongratsMessage(summary);
    
    // Update score display
    updateScoreDisplay(summary);
    
    // Update performance badge
    updatePerformanceBadge(summary);
    
    // Store answers for detailed review
    window.answersData = answers;
}

// Update congratulations message
function updateCongratsMessage(summary) {
    const congratsCard = document.getElementById('congratsCard');
    const congratsMessage = document.getElementById('congratsMessage');
    
    if (summary.prize_position) {
        congratsCard.classList.add('prize-winner');
        if (summary.prize_position === 1) {
            congratsMessage.textContent = '🥇 Congratulations! You won First Prize!';
        } else if (summary.prize_position === 2) {
            congratsMessage.textContent = '🥈 Congratulations! You won Second Prize!';
        } else if (summary.prize_position === 3) {
            congratsMessage.textContent = '🥉 Congratulations! You won Third Prize!';
        }
    } else {
        congratsMessage.textContent = 'You have successfully completed the quiz!';
    }
}

// Update score display
function updateScoreDisplay(summary) {
    const percentage = Math.round(summary.percentage_score || 0);
    
    // Animate score circle
    document.getElementById('scoreCircle').style.setProperty('--progress', `${percentage}%`);
    document.getElementById('scorePercentage').textContent = percentage;
    
    // Update statistics
    document.getElementById('correctCount').textContent = summary.correct_answers || 0;
    document.getElementById('incorrectCount').textContent = summary.incorrect_answers || 0;
    document.getElementById('unansweredCount').textContent = summary.unanswered || 0;
    document.getElementById('timeTaken').textContent = formatDuration(summary.completion_time_seconds || 0);
}

// Update performance badge
function updatePerformanceBadge(summary) {
    const badge = document.getElementById('performanceBadge');
    const category = summary.performance_category || 'N/A';
    
    let badgeClass = '';
    switch(category) {
        case 'Excellent':
            badgeClass = 'bg-green-100 text-green-800';
            break;
        case 'Good':
            badgeClass = 'bg-blue-100 text-blue-800';
            break;
        case 'Needs Improvement':
            badgeClass = 'bg-yellow-100 text-yellow-800';
            break;
        default:
            badgeClass = 'bg-gray-100 text-gray-800';
    }
    
    badge.className = `inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${badgeClass}`;
    badge.textContent = category;
}


// Show detailed review modal
function showDetailedReview() {
    if (!window.answersData) return;
    
    const reviewContent = document.getElementById('reviewContent');
    const totalQuestions = window.answersData.length;
    
    // Add progress indicator at the top
    const progressHtml = `
        <div class="sticky top-0 bg-white border-b border-gray-200 pb-4 mb-4 -mx-6 px-6">
            <div class="text-sm text-gray-600 text-center">
                Showing all ${totalQuestions} questions
            </div>
        </div>
    `;
    
    const questionsHtml = window.answersData.map((answer, index) => {
        const options = [
            { key: 'a', text: answer.option_a },
            { key: 'b', text: answer.option_b },
            { key: 'c', text: answer.option_c },
            { key: 'd', text: answer.option_d }
        ];
        
        const correctOption = options.find(opt => opt.key === answer.correct_answer);
        const selectedOption = options.find(opt => opt.key === answer.selected_answer);
        
        let statusClass = '';
        let statusIcon = '';
        let statusText = '';
        
        if (answer.selected_answer === null) {
            statusClass = 'answer-unanswered';
            statusIcon = 'fas fa-minus-circle text-gray-500';
            statusText = 'Unanswered';
        } else if (answer.is_correct) {
            statusClass = 'answer-correct';
            statusIcon = 'fas fa-check-circle text-green-600';
            statusText = 'Correct';
        } else {
            statusClass = 'answer-incorrect';
            statusIcon = 'fas fa-times-circle text-red-600';
            statusText = 'Incorrect';
        }
        
        return `
            <div class="answer-item ${statusClass} mb-4">
                <!-- Question Header -->
                <div class="flex items-start justify-between mb-3">
                    <div class="flex-1">
                        <div class="flex items-center mb-2">
                            <span class="bg-gray-100 text-gray-700 text-xs font-medium px-2 py-1 rounded mr-2">
                                Q${index + 1}/${totalQuestions}
                            </span>
                            <div class="flex items-center">
                                <i class="${statusIcon} mr-1"></i>
                                <span class="text-sm font-medium">${statusText}</span>
                            </div>
                        </div>
                        <h5 class="font-medium text-gray-900 leading-relaxed">${answer.question_text}</h5>
                    </div>
                </div>
                
                <!-- Answer Options -->
                <div class="space-y-3 text-sm">
                    ${options.map(option => `
                        <div class="flex items-start p-2 rounded ${
                            option.key === answer.correct_answer ? 'bg-green-50 border border-green-200' : 
                            option.key === answer.selected_answer && !answer.is_correct ? 'bg-red-50 border border-red-200' : 'bg-gray-50'
                        }">
                            <span class="w-6 font-medium flex-shrink-0 ${
                                option.key === answer.correct_answer ? 'text-green-700' : 
                                option.key === answer.selected_answer && !answer.is_correct ? 'text-red-700' : 'text-gray-600'
                            }">${option.key.toUpperCase()}.</span>
                            <span class="flex-1 ${
                                option.key === answer.correct_answer ? 'text-green-700 font-medium' : 
                                option.key === answer.selected_answer && !answer.is_correct ? 'text-red-700' : 'text-gray-600'
                            }">${option.text}</span>
                            <div class="flex-shrink-0 ml-2">
                                ${option.key === answer.correct_answer ? '<i class="fas fa-check text-green-600"></i>' : ''}
                                ${option.key === answer.selected_answer && answer.is_correct ? '<i class="fas fa-user-check text-blue-600" title="Your answer"></i>' : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
                
                ${!answer.is_correct && answer.selected_answer ? `
                    <div class="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div class="text-sm text-blue-800">
                            <i class="fas fa-info-circle mr-1"></i>
                            <strong>Correct Answer:</strong> ${correctOption ? `${correctOption.key.toUpperCase()}. ${correctOption.text}` : 'Not available'}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
    
    // Combine progress indicator and questions
    reviewContent.innerHTML = progressHtml + questionsHtml;
    
    document.getElementById('reviewModal').classList.remove('hidden');
}

// Close detailed review modal
function closeReviewModal() {
    document.getElementById('reviewModal').classList.add('hidden');
}


// Go back to dashboard
function goHome() {
    window.location.href = '/quiz/dashboard.html';
}

// Show loading state
function showLoading(loading) {
    const loadingState = document.getElementById('loadingState');
    const resultsContent = document.getElementById('resultsContent');
    
    if (loading) {
        loadingState.classList.remove('hidden');
        resultsContent.classList.add('hidden');
    } else {
        loadingState.classList.add('hidden');
    }
}

// Show error message
function showError(message) {
    alert(message); // Could be enhanced with better error UI
}

// Show waiting message for session in progress
function showWaitingMessage(message) {
    const loadingState = document.getElementById('loadingState');
    const resultsContent = document.getElementById('resultsContent');
    const loadingText = loadingState.querySelector('p');
    
    if (loadingText) {
        loadingText.textContent = message;
    }
    
    loadingState.classList.remove('hidden');
    resultsContent.classList.add('hidden');
}

// Hide waiting message
function hideWaitingMessage() {
    const loadingState = document.getElementById('loadingState');
    const resultsContent = document.getElementById('resultsContent');
    const loadingText = loadingState.querySelector('p');
    
    if (loadingText) {
        loadingText.textContent = 'Loading your quiz results...';
    }
    
    loadingState.classList.add('hidden');
    resultsContent.classList.remove('hidden');
}

// Format duration helper
function formatDuration(seconds) {
    if (!seconds) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}