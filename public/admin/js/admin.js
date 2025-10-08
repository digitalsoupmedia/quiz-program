// Admin Panel JavaScript

// Global variables
let authToken = localStorage.getItem('adminToken');
let socket = null;
let currentSession = null;
let selectedParticipants = new Set();
let sessionTimer = null;

// Helper function to create fetch options with proper authentication
function createFetchOptions(method = 'GET', body = null, extraHeaders = {}) {
    const options = {
        method,
        credentials: 'include', // Always include cookies for proxy compatibility
        headers: {
            ...extraHeaders
        }
    };
    
    // Add Authorization header if token exists (fallback)
    if (authToken) {
        options.headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    // Add body if provided
    if (body) {
        if (body instanceof FormData) {
            // Don't set Content-Type for FormData, browser will set it with boundary
        } else {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }
    }
    
    return options;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    checkAuthentication();
    initializeNavigation();
    initializeSocketConnection();
    loadDashboard();
});

// Authentication functions
function checkAuthentication() {
    // Don't redirect immediately if no localStorage token - cookies might work
    // The fetch will handle authentication verification
    
    // Verify token with server (prioritize cookies, fallback to headers)
    fetch('/api/auth/verify', createFetchOptions())
    .then(response => {
        if (!response.ok) {
            throw new Error('Invalid token');
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            document.getElementById('admin-name').textContent = data.data.user.username;
        } else {
            throw new Error('Token verification failed');
        }
    })
    .catch(error => {
        console.error('Authentication error:', error);
        logout();
    });
}

function logout() {
    localStorage.removeItem('adminToken');
    if (socket) {
        socket.disconnect();
    }
    window.location.href = '/admin/login.html';
}

// Navigation
function initializeNavigation() {
    const navLinks = document.querySelectorAll('.nav-link[data-section]');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const section = this.getAttribute('data-section');
            showSection(section);
            
            // Update active nav link
            navLinks.forEach(nl => nl.classList.remove('active'));
            this.classList.add('active');
        });
    });
}

function showSection(sectionName) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Show selected section
    const targetSection = document.getElementById(`${sectionName}-section`);
    if (targetSection) {
        targetSection.classList.add('active');
        
        // Load section-specific data
        switch(sectionName) {
            case 'dashboard':
                loadDashboard();
                break;
            case 'participants':
                loadParticipants();
                break;
            case 'quizzes':
                loadQuizzes();
                break;
            case 'sessions':
                loadSessions();
                break;
            case 'results':
                loadResults();
                break;
        }
    }
}

// Socket.io connection
function initializeSocketConnection() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('Connected to server');
        // Authenticate socket connection
        socket.emit('authenticate', {
            token: authToken,
            userType: 'admin'
        });
    });
    
    socket.on('authenticated', (data) => {
        console.log('Socket authenticated');
    });
    
    socket.on('participant_count', (data) => {
        updateLiveParticipantCount(data.count);
    });
    
    socket.on('quiz_started', (data) => {
        handleQuizStarted(data);
    });
    
    socket.on('quiz_completed', (data) => {
        handleQuizCompleted(data);
    });
    
    socket.on('prize_winners_announced', (data) => {
        handlePrizeWinnersAnnounced(data);
    });
}

// Dashboard functions
function loadDashboard() {
    showLoading();
    
    fetch('/api/admin/dashboard', createFetchOptions())
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            updateDashboardStats(data.data.statistics);
            updateRecentSessions(data.data.recentSessions);
            updateTopPerformers(data.data.topPerformers);
        }
    })
    .catch(error => {
        console.error('Dashboard load error:', error);
        showToast('Error loading dashboard', 'error');
    })
    .finally(() => {
        hideLoading();
    });
}

function refreshDashboard() {
    loadDashboard();
    showToast('Dashboard refreshed', 'success');
}

function updateDashboardStats(stats) {
    document.getElementById('total-participants').textContent = stats.total_participants || 0;
    document.getElementById('total-quizzes').textContent = stats.total_quizzes || 0;
    document.getElementById('active-sessions').textContent = stats.active_sessions || 0;
    document.getElementById('total-results').textContent = stats.total_results || 0;
}

function updateRecentSessions(sessions) {
    const container = document.getElementById('recent-sessions');
    
    if (sessions.length === 0) {
        container.innerHTML = '<p class="text-muted">No recent sessions</p>';
        return;
    }
    
    const table = document.createElement('table');
    table.className = 'table table-sm';
    table.innerHTML = `
        <thead>
            <tr>
                <th>Session</th>
                <th>Quiz</th>
                <th>Status</th>
                <th>Date</th>
            </tr>
        </thead>
        <tbody>
            ${sessions.map(session => `
                <tr>
                    <td>${session.session_name}</td>
                    <td>${session.quiz_title}</td>
                    <td><span class="badge status-${session.status}">${session.status}</span></td>
                    <td>${new Date(session.start_time).toLocaleDateString()}</td>
                </tr>
            `).join('')}
        </tbody>
    `;
    
    container.innerHTML = '';
    container.appendChild(table);
}

function updateTopPerformers(performers) {
    const container = document.getElementById('top-performers');
    
    if (performers.length === 0) {
        container.innerHTML = '<p class="text-muted">No performance data</p>';
        return;
    }
    
    const table = document.createElement('table');
    table.className = 'table table-sm';
    table.innerHTML = `
        <thead>
            <tr>
                <th>Name</th>
                <th>Quiz</th>
                <th>Score</th>
                <th>Time</th>
            </tr>
        </thead>
        <tbody>
            ${performers.map((performer, index) => `
                <tr>
                    <td>
                        ${index < 3 ? ['🥇', '🥈', '🥉'][index] : ''} 
                        ${performer.name}
                    </td>
                    <td>${performer.quiz_title}</td>
                    <td>${performer.total_score}</td>
                    <td>${formatTime(performer.completion_time_seconds)}</td>
                </tr>
            `).join('')}
        </tbody>
    `;
    
    container.innerHTML = '';
    container.appendChild(table);
}

// Participant management functions
function loadParticipants(page = 1, search = '') {
    showLoading();
    
    const params = new URLSearchParams({
        page: page,
        limit: 50,
        search: search
    });
    
    fetch(`/api/admin/participants?${params}`, createFetchOptions())
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            updateParticipantsTable(data.data.participants);
            updatePagination(data.data.pagination, 'participants');
        }
    })
    .catch(error => {
        console.error('Load participants error:', error);
        showToast('Error loading participants', 'error');
    })
    .finally(() => {
        hideLoading();
    });
}

function updateParticipantsTable(participants) {
    const container = document.getElementById('participants-table');
    
    if (participants.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">No participants found</p>';
        return;
    }
    
    const table = document.createElement('table');
    table.className = 'table table-hover';
    table.innerHTML = `
        <thead>
            <tr>
                <th>
                    <input type="checkbox" id="select-all-participants" onchange="toggleAllParticipants()">
                </th>
                <th>Name</th>
                <th>Email</th>
                <th>Designation</th>
                <th>Company</th>
                <th>Username</th>
                <th>Status</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>
            ${participants.map(participant => `
                <tr class="participant-row" data-participant-id="${participant.id}">
                    <td>
                        <input type="checkbox" class="participant-checkbox" 
                               value="${participant.id}" 
                               onchange="toggleParticipantSelection(${participant.id})">
                    </td>
                    <td>${participant.name}</td>
                    <td>${participant.email}</td>
                    <td>${participant.designation || '-'}</td>
                    <td>${participant.company || '-'}</td>
                    <td>${participant.username || '-'}</td>
                    <td>
                        <span class="badge ${participant.is_active ? 'bg-success' : 'bg-secondary'}">
                            ${participant.is_active ? 'Active' : 'Inactive'}
                        </span>
                    </td>
                    <td>
                        <div class="btn-group btn-group-sm">
                            <button class="btn btn-outline-primary" onclick="editParticipant(${participant.id})">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-outline-${participant.is_active ? 'warning' : 'success'}" 
                                    onclick="toggleParticipantStatus(${participant.id}, ${!participant.is_active})">
                                <i class="fas fa-${participant.is_active ? 'ban' : 'check'}"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `).join('')}
        </tbody>
    `;
    
    container.innerHTML = '';
    container.appendChild(table);
}

function searchParticipants() {
    const search = document.getElementById('participant-search').value;
    loadParticipants(1, search);
}

function toggleAllParticipants() {
    const selectAll = document.getElementById('select-all-participants');
    const checkboxes = document.querySelectorAll('.participant-checkbox');
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAll.checked;
        toggleParticipantSelection(parseInt(checkbox.value), false);
    });
}

function toggleParticipantSelection(participantId, updateCheckbox = true) {
    if (selectedParticipants.has(participantId)) {
        selectedParticipants.delete(participantId);
    } else {
        selectedParticipants.add(participantId);
    }
    
    if (updateCheckbox) {
        const checkbox = document.querySelector(`input[value="${participantId}"]`);
        if (checkbox) {
            checkbox.checked = selectedParticipants.has(participantId);
        }
    }
    
    updateSelectedParticipantsDisplay();
}

function updateSelectedParticipantsDisplay() {
    const container = document.getElementById('selected-participants');
    
    if (selectedParticipants.size === 0) {
        container.innerHTML = '<p class="text-muted">No participants selected</p>';
        return;
    }
    
    container.innerHTML = `
        <p><strong>${selectedParticipants.size}</strong> participants selected</p>
        <div class="small text-muted">
            Click "Send Credentials" to send login information to selected participants.
        </div>
    `;
}

// Upload participants
function uploadParticipants() {
    const fileInput = document.getElementById('participantFile');
    const sessionSelect = document.getElementById('sessionSelect');
    
    if (!fileInput.files[0]) {
        showToast('Please select a file', 'error');
        return;
    }
    
    const formData = new FormData();
    formData.append('participantFile', fileInput.files[0]);
    if (sessionSelect.value) {
        formData.append('sessionId', sessionSelect.value);
    }
    
    showLoading();
    
    fetch('/api/admin/participants/upload', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${authToken}`
        },
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast(`Successfully processed ${data.data.successful} participants`, 'success');
            if (data.data.failed > 0) {
                showToast(`${data.data.failed} participants failed to process`, 'warning');
            }
            
            // Close modal and refresh participants
            bootstrap.Modal.getInstance(document.getElementById('uploadParticipantsModal')).hide();
            loadParticipants();
            
            // Reset form
            document.getElementById('uploadParticipantsForm').reset();
        } else {
            showToast(data.message || 'Upload failed', 'error');
        }
    })
    .catch(error => {
        console.error('Upload error:', error);
        showToast('Upload failed', 'error');
    })
    .finally(() => {
        hideLoading();
    });
}

// View credentials for manual distribution
function viewCredentials() {
    if (selectedParticipants.size === 0) {
        showToast('Please select participants first', 'error');
        return;
    }
    
    showLoading();
    
    fetch('/api/admin/participants/get-credentials', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            participantIds: Array.from(selectedParticipants)
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            displayCredentialsTable(data.data);
            bootstrap.Modal.getInstance(document.getElementById('viewCredentialsModal')).show();
        } else {
            showToast(data.message || 'Failed to get credentials', 'error');
        }
    })
    .catch(error => {
        console.error('Get credentials error:', error);
        showToast('Failed to get credentials', 'error');
    })
    .finally(() => {
        hideLoading();
    });
}

function displayCredentialsTable(credentials) {
    const container = document.getElementById('credentials-table');
    
    if (credentials.length === 0) {
        container.innerHTML = '<p class="text-muted">No credentials found</p>';
        return;
    }
    
    const table = document.createElement('table');
    table.className = 'table table-striped';
    table.innerHTML = `
        <thead>
            <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Username</th>
                <th>Company</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>
            ${credentials.map(cred => `
                <tr>
                    <td>${cred.name}</td>
                    <td>${cred.email}</td>
                    <td>
                        <code>${cred.username}</code>
                        <button class="btn btn-sm btn-outline-secondary ms-2" onclick="copyToClipboard('${cred.username}')">
                            <i class="fas fa-copy"></i>
                        </button>
                    </td>
                    <td>${cred.company || '-'}</td>
                    <td>
                        <button class="btn btn-sm btn-primary" onclick="showParticipantDetails(${cred.id})">
                            <i class="fas fa-info-circle"></i> Details
                        </button>
                    </td>
                </tr>
            `).join('')}
        </tbody>
    `;
    
    container.innerHTML = '';
    container.appendChild(table);
    
    // Store credentials for export
    window.currentCredentials = credentials;
}

function exportCredentials() {
    if (!window.currentCredentials) {
        showToast('No credentials to export', 'error');
        return;
    }
    
    const csvContent = [
        ['Name', 'Email', 'Username', 'Designation', 'Company'],
        ...window.currentCredentials.map(cred => [
            cred.name,
            cred.email,
            cred.username,
            cred.designation || '',
            cred.company || ''
        ])
    ].map(row => row.map(field => `"${field}"`).join(',')).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quiz_credentials_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showToast('Credentials exported to CSV', 'success');
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard', 'success');
    }).catch(() => {
        showToast('Failed to copy to clipboard', 'error');
    });
}

// Send credentials
function sendCredentials() {
    if (selectedParticipants.size === 0) {
        showToast('Please select participants first', 'error');
        return;
    }
    
    const method = document.querySelector('input[name="sendMethod"]:checked').value;
    
    showLoading();
    
    fetch('/api/admin/participants/send-credentials', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            participantIds: Array.from(selectedParticipants),
            method: method
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast(`Credentials sent via ${method} to ${data.data.sent} participants`, 'success');
            if (data.data.failed > 0) {
                showToast(`Failed to send to ${data.data.failed} participants`, 'warning');
                console.log('Failed sends:', data.data.details.failed);
            }
            
            // Close modal and clear selection
            bootstrap.Modal.getInstance(document.getElementById('sendCredentialsModal')).hide();
            selectedParticipants.clear();
            loadParticipants();
        } else {
            showToast(data.message || 'Failed to send credentials', 'error');
        }
    })
    .catch(error => {
        console.error('Send credentials error:', error);
        showToast('Failed to send credentials', 'error');
    })
    .finally(() => {
        hideLoading();
    });
}

// Quiz management functions
function loadQuizzes() {
    // Implementation for loading quizzes
    showToast('Quiz management coming soon', 'info');
}

function createQuiz() {
    const form = document.getElementById('createQuizForm');
    const formData = new FormData(form);
    
    const quizData = {
        title: formData.get('title'),
        description: formData.get('description'),
        startDate: formData.get('startDate'),
        startTime: formData.get('startTime'),
        totalQuestions: parseInt(formData.get('totalQuestions'))
    };
    
    showLoading();
    
    fetch('/api/admin/quizzes', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(quizData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast('Quiz created successfully', 'success');
            bootstrap.Modal.getInstance(document.getElementById('createQuizModal')).hide();
            form.reset();
            loadQuizzes();
        } else {
            showToast(data.message || 'Failed to create quiz', 'error');
        }
    })
    .catch(error => {
        console.error('Create quiz error:', error);
        showToast('Failed to create quiz', 'error');
    })
    .finally(() => {
        hideLoading();
    });
}

// Session management functions
function loadSessions() {
    showToast('Session management coming soon', 'info');
}

function startInstructionPhase() {
    if (!currentSession) return;
    
    fetch(`/api/admin/sessions/${currentSession}/start-instruction`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast('Instruction phase started', 'success');
            updateSessionControls('instruction');
        }
    })
    .catch(error => {
        console.error('Start instruction error:', error);
        showToast('Failed to start instruction phase', 'error');
    });
}

function startQuizTimer() {
    if (!currentSession) return;
    
    fetch(`/api/admin/sessions/${currentSession}/start-quiz`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast('Quiz timer started', 'success');
            updateSessionControls('active');
            startLocalTimer(data.data.duration);
        }
    })
    .catch(error => {
        console.error('Start quiz timer error:', error);
        showToast('Failed to start quiz timer', 'error');
    });
}

function updateSessionControls(status) {
    const startInstructionBtn = document.getElementById('start-instruction-btn');
    const startQuizBtn = document.getElementById('start-quiz-btn');
    const endSessionBtn = document.getElementById('end-session-btn');
    
    switch(status) {
        case 'instruction':
            startInstructionBtn.disabled = true;
            startQuizBtn.disabled = false;
            endSessionBtn.disabled = false;
            document.getElementById('timer-status').textContent = 'Instruction phase active';
            break;
        case 'active':
            startInstructionBtn.disabled = true;
            startQuizBtn.disabled = true;
            endSessionBtn.disabled = false;
            document.getElementById('timer-status').textContent = 'Quiz in progress';
            break;
        case 'completed':
            startInstructionBtn.disabled = true;
            startQuizBtn.disabled = true;
            endSessionBtn.disabled = true;
            document.getElementById('timer-status').textContent = 'Session completed';
            break;
    }
}

function startLocalTimer(duration) {
    let timeLeft = duration;
    
    sessionTimer = setInterval(() => {
        const minutes = Math.floor(timeLeft / 60000);
        const seconds = Math.floor((timeLeft % 60000) / 1000);
        
        document.getElementById('timer-display').textContent = 
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        if (timeLeft <= 60000) { // Last minute
            document.getElementById('timer-display').style.color = '#dc3545';
        }
        
        timeLeft -= 1000;
        
        if (timeLeft < 0) {
            clearInterval(sessionTimer);
            updateSessionControls('completed');
            showToast('Quiz session completed', 'info');
        }
    }, 1000);
}

function updateLiveParticipantCount(count) {
    const element = document.getElementById('live-participant-count');
    if (element) {
        element.textContent = count;
    }
}

// Results functions
function loadResults() {
    showToast('Results viewing coming soon', 'info');
}

function exportResults(format) {
    showToast(`Export to ${format.toUpperCase()} coming soon`, 'info');
}

// Utility functions
function showLoading() {
    document.getElementById('loading-overlay').classList.add('show');
}

function hideLoading() {
    document.getElementById('loading-overlay').classList.remove('show');
}

function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    const toastId = 'toast-' + Date.now();
    
    const toastHtml = `
        <div id="${toastId}" class="toast align-items-center text-white bg-${type === 'error' ? 'danger' : type}" role="alert">
            <div class="d-flex">
                <div class="toast-body">
                    <i class="fas fa-${getToastIcon(type)}"></i> ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        </div>
    `;
    
    toastContainer.insertAdjacentHTML('beforeend', toastHtml);
    
    const toastElement = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastElement, { delay: 5000 });
    toast.show();
    
    // Remove toast element after it's hidden
    toastElement.addEventListener('hidden.bs.toast', () => {
        toastElement.remove();
    });
}

function getToastIcon(type) {
    switch(type) {
        case 'success': return 'check-circle';
        case 'error': return 'exclamation-triangle';
        case 'warning': return 'exclamation-triangle';
        case 'info': return 'info-circle';
        default: return 'info-circle';
    }
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function updatePagination(pagination, type) {
    const container = document.getElementById(`${type}-pagination`);
    
    if (pagination.totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    let paginationHtml = '<nav><ul class="pagination justify-content-center">';
    
    // Previous button
    paginationHtml += `
        <li class="page-item ${pagination.page === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="load${type.charAt(0).toUpperCase() + type.slice(1)}(${pagination.page - 1})">Previous</a>
        </li>
    `;
    
    // Page numbers
    for (let i = 1; i <= pagination.totalPages; i++) {
        if (i === pagination.page || 
            i === 1 || 
            i === pagination.totalPages || 
            (i >= pagination.page - 2 && i <= pagination.page + 2)) {
            paginationHtml += `
                <li class="page-item ${i === pagination.page ? 'active' : ''}">
                    <a class="page-link" href="#" onclick="load${type.charAt(0).toUpperCase() + type.slice(1)}(${i})">${i}</a>
                </li>
            `;
        } else if (i === pagination.page - 3 || i === pagination.page + 3) {
            paginationHtml += '<li class="page-item disabled"><span class="page-link">...</span></li>';
        }
    }
    
    // Next button
    paginationHtml += `
        <li class="page-item ${pagination.page === pagination.totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="load${type.charAt(0).toUpperCase() + type.slice(1)}(${pagination.page + 1})">Next</a>
        </li>
    `;
    
    paginationHtml += '</ul></nav>';
    container.innerHTML = paginationHtml;
}

// Socket event handlers
function handleQuizStarted(data) {
    showToast('Quiz started successfully', 'success');
    updateSessionControls('active');
}

function handleQuizCompleted(data) {
    showToast('Quiz session completed', 'info');
    updateSessionControls('completed');
    if (sessionTimer) {
        clearInterval(sessionTimer);
    }
}

function handlePrizeWinnersAnnounced(data) {
    if (data.winners && data.winners.length > 0) {
        const winnersText = data.winners.map(w => `${w.prize} - ${w.name} (${w.score} points)`).join(', ');
        showToast(`Prize Winners: ${winnersText}`, 'success');
    }
}