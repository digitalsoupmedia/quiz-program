// Dashboard functionality for quiz participants
let participantInfo = {};

// Safely parse participant info from localStorage (for display purposes)
try {
    const storedInfo = localStorage.getItem('participantInfo');
    participantInfo = storedInfo ? JSON.parse(storedInfo) : {};
} catch (error) {
    console.error('Error parsing participant info:', error);
    participantInfo = {};
}
let availableSessions = [];
let selectedSessionId = null;

// Initialize dashboard on page load
// Server-side authentication is handled by middleware, so if we reach this page, we're authenticated
document.addEventListener('DOMContentLoaded', function() {
    initializeDashboard();
});

// Initialize dashboard
async function initializeDashboard() {
    await loadParticipantProfile();
    await loadAvailableSessions();
}

// Load participant profile
async function loadParticipantProfile() {
    try {
        const response = await fetch('/api/participant/profile', {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        // If response status indicates authentication failure, let server handle redirect
        if (response.status === 401 || response.status === 403) {
            console.log('Authentication failed, server will handle redirect');
            return;
        }
        
        const data = await response.json();
        
        if (data.success) {
            participantInfo = data.data;
            localStorage.setItem('participantInfo', JSON.stringify(participantInfo));
            updateProfileDisplay();
        } else {
            console.error('Failed to load profile:', data.message);
        }
    } catch (error) {
        console.error('Load profile error:', error);
        // Don't logout on fetch errors - server middleware will handle authentication
    }
}

// Update profile display
function updateProfileDisplay() {
    document.getElementById('participantName').textContent = participantInfo.name || 'Unknown';
    document.getElementById('participantEmail').textContent = participantInfo.email || '';
    document.getElementById('participantCompany').textContent = participantInfo.company || 'N/A';
    
    // TODO: Load actual stats from backend
    document.getElementById('totalSessions').textContent = '0';
    document.getElementById('completedQuizzes').textContent = '0';
    document.getElementById('avgScore').textContent = '0%';
}

// Load available sessions
async function loadAvailableSessions() {
    try {
        showLoading(true);
        
        const response = await fetch('/api/participant/sessions', {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        // If response status indicates authentication failure, let server handle redirect
        if (response.status === 401 || response.status === 403) {
            console.log('Authentication failed while loading sessions, server will handle redirect');
            return;
        }
        
        const data = await response.json();
        
        if (data.success) {
            availableSessions = data.data;
            displaySessions();
        } else {
            console.error('Failed to load sessions:', data.message);
            showToast('Failed to load quiz sessions', 'error');
            showEmptyState();
        }
    } catch (error) {
        console.error('Load sessions error:', error);
        showToast('Failed to load quiz sessions', 'error');
        showEmptyState();
    } finally {
        showLoading(false);
    }
}

// Display sessions
function displaySessions() {
    const container = document.getElementById('sessionsList');
    const loadingState = document.getElementById('loadingState');
    const emptyState = document.getElementById('emptyState');
    
    loadingState.classList.add('hidden');
    
    if (!availableSessions || availableSessions.length === 0) {
        emptyState.classList.remove('hidden');
        container.classList.add('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    container.classList.remove('hidden');
    
    container.innerHTML = availableSessions.map(session => {
        const statusInfo = getSessionStatusInfo(session);
        const isJoined = session.participation_status === 'joined';
        
        return `
            <div class="session-card p-4 ${isJoined ? 'border-gray-900' : ''}">
                <div class="flex items-start justify-between mb-3">
                    <div class="flex-1">
                        <h4 class="font-semibold text-gray-900 mb-1">${session.session_name}</h4>
                        <p class="text-sm text-gray-600 mb-2">${session.title}</p>
                        <div class="flex items-center space-x-4 text-xs text-gray-500">
                            <span><i class="fas fa-questions mr-1"></i>${session.total_questions} questions</span>
                            <span><i class="fas fa-clock mr-1"></i>15 min</span>
                        </div>
                    </div>
                    <div class="flex items-center space-x-2">
                        <div class="status-dot ${statusInfo.dotColor}"></div>
                        <span class="text-xs text-gray-600">${statusInfo.text}</span>
                    </div>
                </div>
                
                <div class="flex items-center justify-between">
                    <div class="text-xs text-gray-500">
                        <i class="fas fa-calendar mr-1"></i>
                        ${formatDateTime(session.start_time)}
                    </div>
                    
                    ${renderSessionAction(session, statusInfo)}
                </div>
            </div>
        `;
    }).join('');
}

// Get session status information
function getSessionStatusInfo(session) {
    const now = new Date();
    const startTime = new Date(session.start_time);
    
    switch(session.status) {
        case 'scheduled':
            if (now < startTime) {
                return { text: 'Upcoming', dotColor: 'bg-yellow-400' };
            } else {
                return { text: 'Ready', dotColor: 'bg-green-400' };
            }
        case 'instruction':
            return { text: 'Instructions', dotColor: 'bg-blue-400' };
        case 'active':
            return { text: 'Live Quiz', dotColor: 'bg-red-400' };
        case 'completed':
            return { text: 'Completed', dotColor: 'bg-gray-400' };
        default:
            return { text: 'Unknown', dotColor: 'bg-gray-300' };
    }
}

// Render session action button
function renderSessionAction(session, statusInfo) {
    const isJoined = session.participation_status === 'joined' || session.participation_status === 'submitted';
    const hasSubmitted = session.participation_status === 'submitted' || session.submitted_at;
    const hasParticipated = isJoined || hasSubmitted;
    
    if (session.status === 'completed') {
        if (hasParticipated) {
            return `
                <button onclick="viewResults(${session.id})" class="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg text-xs font-medium">
                    <i class="fas fa-chart-bar mr-1"></i>View Results
                </button>
            `;
        } else {
            return `
                <div class="px-4 py-2 bg-gray-100 text-gray-500 rounded-lg text-xs font-medium">
                    <i class="fas fa-clock mr-1"></i>Session Ended
                </div>
            `;
        }
    }
    
    if (hasSubmitted) {
        if (session.status === 'active' || session.status === 'instruction') {
            return `
                <div class="px-4 py-2 bg-green-50 text-green-700 rounded-lg text-xs font-medium">
                    <i class="fas fa-check-circle mr-1"></i>Submitted
                </div>
            `;
        } else {
            return `
                <div class="px-4 py-2 bg-green-50 text-green-700 rounded-lg text-xs font-medium">
                    <i class="fas fa-check-circle mr-1"></i>Submitted
                </div>
            `;
        }
    }
    
    if (isJoined && !hasSubmitted) {
        if (session.status === 'active' || session.status === 'instruction') {
            return `
                <button onclick="enterQuiz(${session.id})" class="px-4 py-2 bg-gray-900 text-white rounded-lg text-xs font-medium">
                    Enter Quiz
                </button>
            `;
        } else {
            return `
                <div class="px-4 py-2 bg-green-50 text-green-700 rounded-lg text-xs font-medium">
                    <i class="fas fa-check mr-1"></i>Joined
                </div>
            `;
        }
    }
    
    if (session.status === 'scheduled') {
        return `
            <div class="px-4 py-2 bg-yellow-50 text-yellow-700 rounded-lg text-xs font-medium">
                <i class="fas fa-clock mr-1"></i>Scheduled
            </div>
        `;
    }
    
    // TEMPORARY CHANGE: For instruction/active sessions, allow direct entry (auto-join)
    // TODO: Revert this to restore join requirement - show "Join Session" button for scheduled sessions
    if (session.status === 'instruction' || session.status === 'active') {
        return `
            <button onclick="enterQuiz(${session.id})" class="px-4 py-2 bg-gray-900 text-white rounded-lg text-xs font-medium">
                <i class="fas fa-play mr-1"></i>Enter Quiz
            </button>
        `;
    }
    
    return `
        <button disabled class="px-4 py-2 bg-gray-100 text-gray-400 rounded-lg text-xs font-medium">
            Unavailable
        </button>
    `;
}

// Show join session modal
function showJoinModal(sessionId) {
    const session = availableSessions.find(s => s.id === sessionId);
    if (!session) return;
    
    selectedSessionId = sessionId;
    
    const content = `
        <div class="text-center mb-4">
            <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <i class="fas fa-users text-gray-600 text-xl"></i>
            </div>
            <h4 class="font-semibold text-gray-900 mb-2">${session.session_name}</h4>
            <p class="text-sm text-gray-600 mb-4">${session.title}</p>
        </div>
        
        <div class="space-y-3 text-sm text-gray-600">
            <div class="flex items-center justify-between">
                <span>Questions:</span>
                <span class="font-medium">${session.total_questions}</span>
            </div>
            <div class="flex items-center justify-between">
                <span>Duration:</span>
                <span class="font-medium">15 minutes</span>
            </div>
            <div class="flex items-center justify-between">
                <span>Start Time:</span>
                <span class="font-medium">${formatDateTime(session.start_time)}</span>
            </div>
        </div>
    `;
    
    document.getElementById('joinModalContent').innerHTML = content;
    document.getElementById('joinModal').classList.remove('hidden');
}

// Close join modal
function closeJoinModal() {
    document.getElementById('joinModal').classList.add('hidden');
    selectedSessionId = null;
}

// Confirm join session
async function confirmJoinSession() {
    if (!selectedSessionId) return;
    
    try {
        setJoinButtonLoading(true);
        
        const response = await fetch(`/api/participant/sessions/${selectedSessionId}/join`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Successfully joined quiz session!', 'success');
            closeJoinModal();
            await loadAvailableSessions();
        } else {
            showToast(data.message || 'Failed to join session', 'error');
        }
    } catch (error) {
        console.error('Join session error:', error);
        showToast('Failed to join session', 'error');
    } finally {
        setJoinButtonLoading(false);
    }
}

// Set join button loading state
function setJoinButtonLoading(loading) {
    const button = document.getElementById('joinConfirmBtn');
    if (loading) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Joining...';
    } else {
        button.disabled = false;
        button.innerHTML = 'Join Session';
    }
}

// Enter quiz
function enterQuiz(sessionId) {
    localStorage.setItem('currentSessionId', sessionId);
    window.location.href = `/quiz/session.html?sessionId=${sessionId}`;
}

// View results
function viewResults(sessionId) {
    localStorage.setItem('resultSessionId', sessionId);
    window.location.href = `/quiz/results.html?sessionId=${sessionId}`;
}

// Refresh sessions
async function refreshSessions() {
    await loadAvailableSessions();
    showToast('Sessions refreshed', 'success');
}

// View profile (current page)
function viewProfile() {
    // Already on profile/dashboard page
}

// View history
function viewHistory() {
    window.location.href = '/quiz/history.html';
}

// Show loading state
function showLoading(loading) {
    const loadingState = document.getElementById('loadingState');
    const sessionsList = document.getElementById('sessionsList');
    const emptyState = document.getElementById('emptyState');
    
    if (loading) {
        loadingState.classList.remove('hidden');
        sessionsList.classList.add('hidden');
        emptyState.classList.add('hidden');
    }
}

// Show empty state
function showEmptyState() {
    const loadingState = document.getElementById('loadingState');
    const sessionsList = document.getElementById('sessionsList');
    const emptyState = document.getElementById('emptyState');
    
    loadingState.classList.add('hidden');
    sessionsList.classList.add('hidden');
    emptyState.classList.remove('hidden');
}

// Logout function
async function logout() {
    try {
        // Call logout API to clear server-side session and cookies
        await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'include' // Include cookies
        });
    } catch (error) {
        console.error('Logout API error:', error);
    }
    
    // Clear client-side data
    localStorage.removeItem('participantInfo');
    localStorage.removeItem('currentSessionId');
    localStorage.removeItem('resultSessionId');
    
    // Redirect to login page
    window.location.href = '/quiz/login.html';
}

// Utility functions
function formatDateTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    
    // Compare dates by checking if they're on the same calendar day
    const dateDay = date.getDate();
    const dateMonth = date.getMonth();
    const dateYear = date.getFullYear();
    
    const nowDay = now.getDate();
    const nowMonth = now.getMonth();
    const nowYear = now.getFullYear();
    
    // Check if it's the same day
    if (dateYear === nowYear && dateMonth === nowMonth && dateDay === nowDay) {
        return `Today ${date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
        })}`;
    }
    
    // Check if it's tomorrow
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (dateYear === tomorrow.getFullYear() && 
        dateMonth === tomorrow.getMonth() && 
        dateDay === tomorrow.getDate()) {
        return `Tomorrow ${date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
        })}`;
    }
    
    // Check if it's yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (dateYear === yesterday.getFullYear() && 
        dateMonth === yesterday.getMonth() && 
        dateDay === yesterday.getDate()) {
        return `Yesterday ${date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
        })}`;
    }
    
    // For other dates, show the full date
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Toast notification function
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    
    const bgColor = type === 'success' ? 'bg-green-500' : 
                   type === 'error' ? 'bg-red-500' : 'bg-gray-600';
    
    toast.className = `${bgColor} text-white px-4 py-3 rounded-lg shadow-lg mb-2 transition-all transform translate-x-full`;
    toast.innerHTML = `
        <div class="flex items-center">
            <i class="fas ${type === 'success' ? 'fa-check' : type === 'error' ? 'fa-exclamation-triangle' : 'fa-info-circle'} mr-2"></i>
            <span>${message}</span>
        </div>
    `;
    
    container.appendChild(toast);
    
    // Animate in
    setTimeout(() => {
        toast.classList.remove('translate-x-full');
    }, 100);
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.add('translate-x-full');
        setTimeout(() => {
            container.removeChild(toast);
        }, 300);
    }, 3000);
}