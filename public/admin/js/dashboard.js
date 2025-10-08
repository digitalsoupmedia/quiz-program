// Modern Dashboard JavaScript

// Global variables
let authToken = localStorage.getItem('adminToken');
let socket = null;
let selectedParticipants = new Set();
let currentCredentials = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async function() {
    const isAuthenticated = await checkAuthentication();
    if (isAuthenticated) {
        // Hide loading screen and show main content
        document.getElementById('auth-loading').style.display = 'none';
        document.getElementById('main-content').classList.add('authenticated');
        
        // Initialize dashboard components
        initializeNavigation();
        initializeSocketConnection();
        loadDashboard();
        initializeSidebar();
        initializeFileUpload();
    }
    // If not authenticated, checkAuthentication() will redirect to login
});

// Authentication
async function checkAuthentication() {
    if (!authToken) {
        window.location.href = '/admin/login.html';
        return false;
    }
    
    try {
        // Add timeout to prevent hanging on auth check
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        const response = await fetch('/api/auth/verify', {
            headers: { 'Authorization': `Bearer ${authToken}` },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) throw new Error('Invalid token');
        
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('admin-name').textContent = data.data.user.username;
            return true;
        } else {
            throw new Error('Token verification failed');
        }
    } catch (error) {
        console.error('Authentication error:', error);
        logout();
        return false;
    }
}

function logout() {
    localStorage.removeItem('adminToken');
    window.location.href = '/admin/login.html';
}

// Navigation
function initializeNavigation() {
    // Update navigation active states
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            // Remove active class from all links
            navLinks.forEach(l => {
                l.classList.remove('text-white', 'bg-sidebar-hover');
                l.classList.add('text-gray-300');
            });
            // Add active class to clicked link
            this.classList.remove('text-gray-300');
            this.classList.add('text-white', 'bg-sidebar-hover');
        });
    });
}

function initializeSidebar() {
    const toggleSidebar = document.getElementById('toggleSidebar');
    const sidebar = document.getElementById('sidebar');
    
    toggleSidebar.addEventListener('click', () => {
        sidebar.classList.toggle('-translate-x-full');
    });
    
    // Close sidebar on mobile when clicking outside
    document.addEventListener('click', (e) => {
        if (window.innerWidth < 1024) {
            if (!sidebar.contains(e.target) && !toggleSidebar.contains(e.target)) {
                sidebar.classList.add('-translate-x-full');
            }
        }
    });
}

function initializeFileUpload() {
    const fileInput = document.getElementById('participantFile');
    const uploadArea = document.querySelector('.border-dashed');
    
    if (!fileInput || !uploadArea) return;
    
    // Remove existing event listeners to prevent duplicates
    const newFileInput = fileInput.cloneNode(true);
    fileInput.parentNode.replaceChild(newFileInput, fileInput);
    
    // Get updated references
    const currentFileInput = document.getElementById('participantFile');
    
    // File input change handler
    currentFileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file && validateFile(file)) {
            updateUploadArea(file);
        }
    });
    
    // Remove existing drag handlers by cloning the upload area
    const newUploadArea = uploadArea.cloneNode(true);
    uploadArea.parentNode.replaceChild(newUploadArea, uploadArea);
    const currentUploadArea = document.querySelector('.border-dashed');
    
    // Drag and drop handlers
    currentUploadArea.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.stopPropagation();
        currentUploadArea.classList.add('border-blue-400', 'bg-blue-50');
        currentUploadArea.classList.remove('border-gray-300');
    });
    
    currentUploadArea.addEventListener('dragleave', function(e) {
        e.preventDefault();
        e.stopPropagation();
        // Only remove highlight if we're leaving the upload area itself
        if (!currentUploadArea.contains(e.relatedTarget)) {
            currentUploadArea.classList.remove('border-blue-400', 'bg-blue-50');
            currentUploadArea.classList.add('border-gray-300');
        }
    });
    
    currentUploadArea.addEventListener('drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
        currentUploadArea.classList.remove('border-blue-400', 'bg-blue-50');
        currentUploadArea.classList.add('border-gray-300');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            
            if (validateFile(file)) {
                // Create a new FileList-like object
                const dt = new DataTransfer();
                dt.items.add(file);
                currentFileInput.files = dt.files;
                updateUploadArea(file);
            }
        }
    });
    
    // Click handler for upload area
    currentUploadArea.addEventListener('click', function(e) {
        if (e.target === currentUploadArea || e.target.closest('.upload-area-content')) {
            currentFileInput.click();
        }
    });
}

function validateFile(file) {
    // Validate file type
    const allowedTypes = ['.csv', '.xlsx', '.xls'];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    
    if (!allowedTypes.includes(fileExtension)) {
        showToast('Please select a CSV or Excel file', 'error');
        return false;
    }
    
    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
        showToast('File size must be less than 10MB', 'error');
        return false;
    }
    
    // Validate file name
    if (file.name.length > 255) {
        showToast('File name is too long', 'error');
        return false;
    }
    
    return true;
}

function updateUploadArea(file) {
    const uploadArea = document.querySelector('.border-dashed');
    const fileSize = (file.size / 1024).toFixed(1);
    const fileIcon = file.name.toLowerCase().endsWith('.csv') ? 'fa-file-csv' : 'fa-file-excel';
    
    uploadArea.innerHTML = `
        <div class="upload-area-content text-center">
            <i class="fas ${fileIcon} text-3xl text-green-500 mb-4"></i>
            <p class="text-gray-900 font-medium">${file.name}</p>
            <p class="text-sm text-gray-500">${fileSize} KB</p>
            <button type="button" onclick="resetFileUpload()" class="text-blue-600 text-sm mt-2 hover:text-blue-800 underline">
                Choose different file
            </button>
        </div>
    `;
}

function resetFileUpload() {
    const fileInput = document.getElementById('participantFile');
    const uploadArea = document.querySelector('.border-dashed');
    
    if (!fileInput || !uploadArea) return;
    
    // Clear the file input
    fileInput.value = '';
    
    // Reset upload area content
    uploadArea.innerHTML = `
        <div class="upload-area-content text-center">
            <i class="fas fa-cloud-upload-alt text-3xl text-gray-400 mb-4"></i>
            <p class="text-gray-600 mb-2">Drag and drop your file here, or</p>
            <input type="file" id="participantFile" accept=".csv,.xlsx,.xls" class="hidden">
            <button onclick="document.getElementById('participantFile').click()" class="text-blue-600 font-medium hover:text-blue-800">browse files</button>
            <p class="text-xs text-gray-500 mt-2">Supports CSV, Excel files</p>
        </div>
    `;
    
    // Reset border styling
    uploadArea.classList.remove('border-blue-400', 'bg-blue-50');
    uploadArea.classList.add('border-gray-300');
    
    // Reinitialize file upload functionality
    initializeFileUpload();
}

function showSection(sectionName) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.add('hidden');
    });
    
    // Show selected section
    const targetSection = document.getElementById(`${sectionName}-section`);
    if (targetSection) {
        targetSection.classList.remove('hidden');
        
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
                loadResultsDashboard();
                loadSessionResults();
                break;
        }
    }
}

// Socket.io connection
function initializeSocketConnection() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('Connected to server');
        socket.emit('authenticate', {
            token: authToken,
            userType: 'admin'
        });
    });
    
    socket.on('authenticated', () => {
        console.log('Socket authenticated');
    });
}

// Dashboard functions
function loadDashboard() {
    showLoading();
    
    fetch('/api/admin/dashboard', {
        headers: { 'Authorization': `Bearer ${authToken}` }
    })
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

function updateDashboardStats(stats) {
    document.getElementById('total-participants').textContent = stats.total_participants || 0;
    document.getElementById('total-quizzes').textContent = stats.total_quizzes || 0;
    document.getElementById('active-sessions').textContent = stats.active_sessions || 0;
    document.getElementById('total-results').textContent = stats.total_results || 0;
}

function updateRecentSessions(sessions) {
    const container = document.getElementById('recent-sessions-table');
    
    if (sessions.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8">
                <i class="fas fa-calendar-times text-3xl text-gray-400 mb-4"></i>
                <p class="text-gray-500">No recent sessions found</p>
            </div>
        `;
        return;
    }
    
    const table = `
        <table class="min-w-full">
            <thead>
                <tr class="border-b border-gray-100">
                    <th class="text-left py-3 px-4 font-medium text-gray-600 text-sm">Session</th>
                    <th class="text-left py-3 px-4 font-medium text-gray-600 text-sm">Quiz</th>
                    <th class="text-left py-3 px-4 font-medium text-gray-600 text-sm">Status</th>
                    <th class="text-left py-3 px-4 font-medium text-gray-600 text-sm">Date</th>
                </tr>
            </thead>
            <tbody>
                ${sessions.map(session => `
                    <tr class="border-b border-gray-50 hover:bg-gray-50">
                        <td class="py-3 px-4">
                            <div class="font-medium text-gray-900">${session.session_name}</div>
                        </td>
                        <td class="py-3 px-4 text-gray-600">${session.quiz_title || 'N/A'}</td>
                        <td class="py-3 px-4">
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(session.status)}">
                                ${session.status}
                            </span>
                        </td>
                        <td class="py-3 px-4 text-gray-600">${formatDate(session.start_time)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = table;
}

function updateTopPerformers(performers) {
    const container = document.getElementById('top-performers-list');
    
    if (performers.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8">
                <i class="fas fa-trophy text-3xl text-gray-400 mb-4"></i>
                <p class="text-gray-500">No performance data yet</p>
            </div>
        `;
        return;
    }
    
    const list = performers.slice(0, 5).map((performer, index) => `
        <div class="flex items-center space-x-3">
            <div class="flex-shrink-0">
                <div class="w-8 h-8 bg-gradient-to-r ${getRankGradient(index)} rounded-full flex items-center justify-center">
                    <span class="text-white text-sm font-bold">${index + 1}</span>
                </div>
            </div>
            <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-gray-900 truncate">${performer.name}</p>
                <p class="text-xs text-gray-500 truncate">${performer.quiz_title}</p>
            </div>
            <div class="text-right">
                <p class="text-sm font-medium text-gray-900">${performer.total_score}</p>
                <p class="text-xs text-gray-500">${formatTime(performer.completion_time_seconds)}</p>
            </div>
        </div>
    `).join('');
    
    container.innerHTML = list;
}

// Participant management
function loadParticipants(page = 1, search = '') {
    showLoading();
    
    const params = new URLSearchParams({ page, limit: 20, search });
    
    fetch(`/api/admin/participants?${params}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            updateParticipantsTable(data.data.participants);
            updatePagination(data.data.pagination);
            updateSearchResults(search, data.data.pagination.total);
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
    const container = document.getElementById('participants-table-container');
    
    if (participants.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12">
                <i class="fas fa-users text-4xl text-gray-400 mb-4"></i>
                <h3 class="text-lg font-medium text-gray-900 mb-2">No participants found</h3>
                <p class="text-gray-500">Upload your first batch of participants to get started</p>
            </div>
        `;
        return;
    }
    
    const table = `
        <table class="min-w-full">
            <thead class="bg-gray-50">
                <tr>
                    <th class="py-3 px-6 text-left">
                        <input type="checkbox" id="select-all" onchange="toggleAllParticipants()" 
                               class="rounded border-gray-300 text-blue-600 focus:ring-blue-500">
                    </th>
                    <th class="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th class="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                    <th class="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                    <th class="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th class="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
                ${participants.map(participant => `
                    <tr class="hover:bg-gray-50">
                        <td class="py-4 px-6">
                            <input type="checkbox" value="${participant.id}" onchange="toggleParticipantSelection(${participant.id})"
                                   class="rounded border-gray-300 text-blue-600 focus:ring-blue-500">
                        </td>
                        <td class="py-4 px-6">
                            <div class="flex items-center">
                                <div class="flex-shrink-0 h-10 w-10">
                                    <div class="h-10 w-10 rounded-full bg-gradient-to-r from-blue-400 to-purple-500 flex items-center justify-center">
                                        <span class="text-white font-medium text-sm">${participant.name.charAt(0).toUpperCase()}</span>
                                    </div>
                                </div>
                                <div class="ml-4">
                                    <div class="text-sm font-medium text-gray-900">${participant.name}</div>
                                    <div class="text-sm text-gray-500">${participant.designation || 'N/A'}</div>
                                </div>
                            </div>
                        </td>
                        <td class="py-4 px-6 text-sm text-gray-900">${participant.email}</td>
                        <td class="py-4 px-6 text-sm text-gray-500">${participant.company || 'N/A'}</td>
                        <td class="py-4 px-6">
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${participant.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                                ${participant.is_active ? 'Active' : 'Inactive'}
                            </span>
                        </td>
                        <td class="py-4 px-6 text-sm font-medium">
                            <button onclick="editParticipant(${participant.id})" class="text-blue-600 hover:text-blue-900 mr-3">Edit</button>
                            <button onclick="toggleParticipantStatus(${participant.id}, '${participant.name}', ${participant.is_active})" class="text-${participant.is_active ? 'red' : 'green'}-600 hover:text-${participant.is_active ? 'red' : 'green'}-900">
                                ${participant.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = table;
}

function searchParticipants() {
    const search = document.getElementById('participant-search').value.trim();
    loadParticipants(1, search);
    updateClearButton();
}

function handleSearchKeyPress(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        searchParticipants();
    }
}

let searchTimeout;
function handleSearchInput() {
    const searchInput = document.getElementById('participant-search');
    const search = searchInput.value.trim();
    
    updateClearButton();
    
    // Clear previous timeout
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }
    
    // Set new timeout for real-time search (debounced)
    searchTimeout = setTimeout(() => {
        loadParticipants(1, search);
    }, 500); // Wait 500ms after user stops typing
}

function clearSearch() {
    const searchInput = document.getElementById('participant-search');
    searchInput.value = '';
    updateClearButton();
    loadParticipants(1, ''); // Load all participants
}

function updateClearButton() {
    const searchInput = document.getElementById('participant-search');
    const clearButton = document.getElementById('clear-search');
    
    if (searchInput.value.trim()) {
        clearButton.classList.remove('hidden');
    } else {
        clearButton.classList.add('hidden');
    }
}

function updateSearchResults(search, total) {
    const searchResultsContainer = document.getElementById('search-results');
    
    if (search && search.trim()) {
        searchResultsContainer.innerHTML = `
            <div class="flex items-center space-x-2 text-sm text-gray-600 mb-4">
                <i class="fas fa-search"></i>
                <span>Showing ${total} result${total !== 1 ? 's' : ''} for "<strong>${search}</strong>"</span>
                <button onclick="clearSearch()" class="text-blue-600 hover:text-blue-800 underline ml-2">Clear search</button>
            </div>
        `;
        searchResultsContainer.classList.remove('hidden');
    } else {
        searchResultsContainer.classList.add('hidden');
    }
}

function toggleAllParticipants() {
    const selectAll = document.getElementById('select-all');
    const checkboxes = document.querySelectorAll('input[type="checkbox"][value]');
    
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
}

function viewCredentials() {
    if (selectedParticipants.size === 0) {
        showToast('Please select participants first', 'error');
        return;
    }
    
    if (selectedParticipants.size > 100) {
        showToast('Please select a maximum of 100 participants at a time', 'error');
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
            openModal('viewCredentialsModal');
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
    const container = document.getElementById('credentials-table-container');
    currentCredentials = credentials;
    
    if (credentials.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center py-4">No credentials found</p>';
        return;
    }
    
    const table = `
        <table class="min-w-full">
            <thead class="bg-gray-50">
                <tr>
                    <th class="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th class="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                    <th class="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
                    <th class="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase">Password</th>
                    <th class="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                    <th class="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
                ${credentials.map(cred => `
                    <tr>
                        <td class="py-4 px-6 text-sm font-medium text-gray-900">${cred.name}</td>
                        <td class="py-4 px-6 text-sm text-gray-500">${cred.email}</td>
                        <td class="py-4 px-6">
                            <div class="flex items-center space-x-2">
                                <code class="bg-gray-100 px-2 py-1 rounded text-sm">${cred.username}</code>
                                <button onclick="copyToClipboard('${cred.username}')" class="text-blue-600 hover:text-blue-800">
                                    <i class="fas fa-copy"></i>
                                </button>
                            </div>
                        </td>
                        <td class="py-4 px-6">
                            <div class="flex items-center space-x-2">
                                <code class="bg-gray-100 px-2 py-1 rounded text-sm">${cred.password}</code>
                                <button onclick="copyToClipboard('${cred.password}')" class="text-blue-600 hover:text-blue-800">
                                    <i class="fas fa-copy"></i>
                                </button>
                            </div>
                        </td>
                        <td class="py-4 px-6 text-sm text-gray-500">${cred.company || 'N/A'}</td>
                        <td class="py-4 px-6">
                            <div class="flex items-center space-x-2">
                                <button onclick="copyCredentials('${cred.username}', '${cred.password}')" class="text-green-600 hover:text-green-800 text-sm font-medium">
                                    Copy Both
                                </button>
                                <button onclick="resetPassword(${cred.id}, '${cred.name}')" class="text-orange-600 hover:text-orange-800 text-sm font-medium">
                                    Reset Password
                                </button>
                            </div>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = table;
}

function exportCredentials() {
    if (!currentCredentials) {
        showToast('No credentials to export', 'error');
        return;
    }
    
    const csvContent = [
        ['Name', 'Email', 'Username', 'Password', 'Designation', 'Company'],
        ...currentCredentials.map(cred => [
            cred.name,
            cred.email,
            cred.username,
            cred.password,
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
    
    showToast('Credentials exported successfully', 'success');
}

// File upload
function uploadParticipants() {
    const fileInput = document.getElementById('participantFile');
    const uploadButton = document.querySelector('#uploadParticipantsModal button[onclick="uploadParticipants()"]');
    
    if (!fileInput.files[0]) {
        showToast('Please select a file', 'error');
        return;
    }
    
    const file = fileInput.files[0];
    
    // Validate file using the shared validation function
    if (!validateFile(file)) {
        return;
    }
    
    // Disable upload button to prevent multiple submissions
    if (uploadButton) {
        uploadButton.disabled = true;
        uploadButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Uploading...';
    }
    
    const formData = new FormData();
    formData.append('participantFile', file);
    
    showLoading();
    
    fetch('/api/admin/participants/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` },
        body: formData
    })
    .then(async response => {
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || `Server error: ${response.status}`);
        }
        
        return data;
    })
    .then(data => {
        if (data.success) {
            const successCount = data.data.successful || 0;
            const failedCount = data.data.failed || 0;
            const totalCount = successCount + failedCount;
            
            if (successCount > 0) {
                showToast(`Successfully processed ${successCount} of ${totalCount} participants`, 'success');
            }
            
            if (failedCount > 0) {
                showToast(`${failedCount} participants failed to process. Check console for details.`, 'warning');
                
                // Log detailed error information for debugging
                if (data.data.errors && data.data.errors.length > 0) {
                    console.group('Participant Upload Errors:');
                    data.data.errors.forEach((error, index) => {
                        console.error(`Error ${index + 1}:`, error);
                    });
                    console.groupEnd();
                }
            }
            
            closeModal('uploadParticipantsModal');
            loadParticipants(); // Reload the participants table
            resetFileUpload(); // Reset the file upload area
            selectedParticipants.clear(); // Clear selections
        } else {
            throw new Error(data.message || 'Upload failed');
        }
    })
    .catch(error => {
        console.error('Upload error:', error);
        showToast(error.message || 'Upload failed. Please try again.', 'error');
    })
    .finally(() => {
        hideLoading();
        
        // Re-enable upload button
        if (uploadButton) {
            uploadButton.disabled = false;
            uploadButton.innerHTML = 'Upload';
        }
    });
}

// Utility functions
function openModal(modalId) {
    // Handle special cases before opening modal
    if (modalId === 'createSessionModal') {
        loadQuizzesForSession();
        
        // Set default date to today
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('sessionDate').value = today;
    }
    
    document.getElementById(modalId).classList.remove('hidden');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
    
    // Cleanup session monitoring when closing monitor modal
    if (modalId === 'sessionMonitorModal') {
        stopSessionMonitoring();
    }
    
    // Cleanup session results when closing results modal
    if (modalId === 'sessionResultsModal') {
        showLoading(false); // Ensure loading overlay is hidden
        window.currentResultsSessionId = null; // Clear stored session ID
    }
    
    // Cleanup charts when closing analysis modal
    if (modalId === 'sessionAnalysisModal') {
        cleanupAnalysisCharts();
    }
}

function showLoading() {
    document.getElementById('loading-overlay').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
}

function showToast(message, type = 'info', duration = 5000) {
    const toastContainer = document.getElementById('toast-container');
    const toastId = 'toast-' + Date.now();
    
    const colors = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        warning: 'bg-yellow-500',
        info: 'bg-blue-500'
    };
    
    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    };
    
    const toast = document.createElement('div');
    toast.id = toastId;
    toast.className = `${colors[type]} text-white px-6 py-4 rounded-lg shadow-lg flex items-center space-x-3 transform transition-all duration-300 translate-x-full`;
    toast.innerHTML = `
        <i class="${icons[type]}"></i>
        <span>${message}</span>
        <button onclick="removeToast('${toastId}')" class="ml-4 text-white hover:text-gray-200">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    toastContainer.appendChild(toast);
    
    // Animate in
    setTimeout(() => {
        toast.classList.remove('translate-x-full');
    }, 100);
    
    // Auto remove after specified duration
    setTimeout(() => {
        removeToast(toastId);
    }, duration);
}

function removeToast(toastId) {
    const toast = document.getElementById(toastId);
    if (toast) {
        toast.classList.add('translate-x-full');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard', 'success');
    }).catch(() => {
        showToast('Failed to copy to clipboard', 'error');
    });
}

function copyCredentials(username, password) {
    const text = `Username: ${username}\nPassword: ${password}`;
    navigator.clipboard.writeText(text).then(() => {
        showToast('Credentials copied to clipboard', 'success');
    }).catch(() => {
        showToast('Failed to copy credentials', 'error');
    });
}

function resetPassword(participantId, participantName) {
    if (!confirm(`Are you sure you want to reset the password for ${participantName}?\n\nThis will generate a new password based on their mobile number.`)) {
        return;
    }
    
    showLoading();
    
    fetch('/api/admin/participants/reset-password', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            participantId: participantId
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast(`Password reset successfully for ${participantName}`, 'success');
            
            // Update the current credentials display with new password
            if (currentCredentials) {
                const credIndex = currentCredentials.findIndex(cred => cred.id === participantId);
                if (credIndex !== -1) {
                    currentCredentials[credIndex].password = data.data.newPassword;
                    displayCredentialsTable(currentCredentials);
                }
            }
            
            // Show new password to admin
            showToast(`New password: ${data.data.newPassword}`, 'info', 8000);
        } else {
            showToast(data.message || 'Failed to reset password', 'error');
        }
    })
    .catch(error => {
        console.error('Reset password error:', error);
        showToast('Failed to reset password', 'error');
    })
    .finally(() => {
        hideLoading();
    });
}

function editParticipant(participantId) {
    showLoading();
    
    // Get participant details
    fetch(`/api/admin/participants/${participantId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const participant = data.data;
            
            // Populate form fields
            document.getElementById('editParticipantId').value = participant.id;
            document.getElementById('editName').value = participant.name || '';
            document.getElementById('editEmail').value = participant.email || '';
            document.getElementById('editCompany').value = participant.company || '';
            document.getElementById('editDesignation').value = participant.designation || '';
            document.getElementById('editMobile').value = participant.mobile || '';
            
            openModal('editParticipantModal');
        } else {
            showToast(data.message || 'Failed to get participant details', 'error');
        }
    })
    .catch(error => {
        console.error('Get participant error:', error);
        showToast('Failed to get participant details', 'error');
    })
    .finally(() => {
        hideLoading();
    });
}

function saveParticipant() {
    const participantId = document.getElementById('editParticipantId').value;
    const name = document.getElementById('editName').value.trim();
    const email = document.getElementById('editEmail').value.trim();
    const company = document.getElementById('editCompany').value.trim();
    const designation = document.getElementById('editDesignation').value.trim();
    const mobile = document.getElementById('editMobile').value.trim();
    
    if (!name || !email) {
        showToast('Name and email are required', 'error');
        return;
    }
    
    showLoading();
    
    fetch(`/api/admin/participants/${participantId}`, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name,
            email,
            company,
            designation,
            mobile
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast('Participant updated successfully', 'success');
            closeModal('editParticipantModal');
            loadParticipants(); // Refresh the participants table
        } else {
            showToast(data.message || 'Failed to update participant', 'error');
        }
    })
    .catch(error => {
        console.error('Update participant error:', error);
        showToast('Failed to update participant', 'error');
    })
    .finally(() => {
        hideLoading();
    });
}

function toggleParticipantStatus(participantId, participantName, isActive) {
    const action = isActive ? 'deactivate' : 'activate';
    const confirmMessage = `Are you sure you want to ${action} ${participantName}?`;
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    showLoading();
    
    fetch(`/api/admin/participants/${participantId}/toggle-status`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${authToken}` }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast(data.message, 'success');
            loadParticipants(); // Refresh the participants table
        } else {
            showToast(data.message || 'Failed to update participant status', 'error');
        }
    })
    .catch(error => {
        console.error('Toggle status error:', error);
        showToast('Failed to update participant status', 'error');
    })
    .finally(() => {
        hideLoading();
    });
}

// ==================== QUIZ MANAGEMENT FUNCTIONS ====================

// Global variables for quiz management
let currentQuizzes = [];
let currentQuizForQuestions = null;
let questionCounter = 0;

// Load quizzes with search and pagination
function loadQuizzes(page = 1, search = '') {
    showLoading();
    
    const params = new URLSearchParams({ page, limit: 20, search });
    
    fetch(`/api/admin/quizzes?${params}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            currentQuizzes = data.data.quizzes;
            updateQuizzesTable(data.data.quizzes);
            updateQuizzesPagination(data.data.pagination);
            updateQuizSearchResults(search, data.data.pagination.total);
        } else {
            showToast(data.message || 'Failed to load quizzes', 'error');
        }
    })
    .catch(error => {
        console.error('Load quizzes error:', error);
        showToast('Error loading quizzes', 'error');
    })
    .finally(() => {
        hideLoading();
    });
}

// Quiz search functions
function searchQuizzes() {
    const search = document.getElementById('quiz-search').value.trim();
    loadQuizzes(1, search);
    updateQuizClearButton();
}

function handleQuizSearchKeyPress(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        searchQuizzes();
    }
}

let quizSearchTimeout;
function handleQuizSearchInput() {
    const searchInput = document.getElementById('quiz-search');
    const search = searchInput.value.trim();
    
    updateQuizClearButton();
    
    if (quizSearchTimeout) {
        clearTimeout(quizSearchTimeout);
    }
    
    quizSearchTimeout = setTimeout(() => {
        loadQuizzes(1, search);
    }, 500);
}

function clearQuizSearch() {
    const searchInput = document.getElementById('quiz-search');
    searchInput.value = '';
    updateQuizClearButton();
    loadQuizzes(1, '');
}

function updateQuizClearButton() {
    const searchInput = document.getElementById('quiz-search');
    const clearButton = document.getElementById('clear-quiz-search');
    
    if (searchInput.value.trim()) {
        clearButton.classList.remove('hidden');
    } else {
        clearButton.classList.add('hidden');
    }
}

function updateQuizSearchResults(search, total) {
    const searchResultsContainer = document.getElementById('quiz-search-results');
    
    if (search && search.trim()) {
        searchResultsContainer.innerHTML = `
            <div class="flex items-center space-x-2 text-sm text-gray-600 mb-4">
                <i class="fas fa-search"></i>
                <span>Showing ${total} quiz${total !== 1 ? 'zes' : ''} for "<strong>${search}</strong>"</span>
                <button onclick="clearQuizSearch()" class="text-blue-600 hover:text-blue-800 underline ml-2">Clear search</button>
            </div>
        `;
        searchResultsContainer.classList.remove('hidden');
    } else {
        searchResultsContainer.classList.add('hidden');
    }
}

// Update quizzes table
function updateQuizzesTable(quizzes) {
    const container = document.getElementById('quizzes-table-container');
    
    if (quizzes.length === 0) {
        container.innerHTML = '<div class="p-8 text-center text-gray-500">No quizzes found</div>';
        return;
    }
    
    const table = `
        <table class="min-w-full">
            <thead class="bg-gray-50">
                <tr>
                    <th class="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quiz Details</th>
                    <th class="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Schedule</th>
                    <th class="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Configuration</th>
                    <th class="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th class="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
                ${quizzes.map(quiz => `
                    <tr class="hover:bg-gray-50">
                        <td class="py-4 px-6">
                            <div>
                                <div class="text-sm font-medium text-gray-900">${quiz.title}</div>
                                <div class="text-sm text-gray-500">${quiz.description || 'No description'}</div>
                            </div>
                        </td>
                        <td class="py-4 px-6">
                            <div class="text-sm text-gray-900">${formatDate(quiz.start_date)}</div>
                            <div class="text-sm text-gray-500">${quiz.start_time}</div>
                        </td>
                        <td class="py-4 px-6">
                            <div class="text-sm text-gray-900">${quiz.total_questions} questions</div>
                            <div class="text-sm text-gray-500">${quiz.quiz_time_minutes}min quiz, ${quiz.instruction_time_minutes}min instructions</div>
                        </td>
                        <td class="py-4 px-6">
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${quiz.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                                ${quiz.is_active ? 'Active' : 'Inactive'}
                            </span>
                        </td>
                        <td class="py-4 px-6 text-sm font-medium space-x-2">
                            <button onclick="editQuiz(${quiz.id})" class="text-blue-600 hover:text-blue-900">Edit</button>
                            <button onclick="manageQuestions(${quiz.id}, '${quiz.title}')" class="text-green-600 hover:text-green-900">Questions</button>
                            <button onclick="toggleQuizStatus(${quiz.id}, '${quiz.title}', ${quiz.is_active})" class="text-${quiz.is_active ? 'red' : 'green'}-600 hover:text-${quiz.is_active ? 'red' : 'green'}-900">
                                ${quiz.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                            <button onclick="deleteQuiz(${quiz.id}, '${quiz.title}')" class="text-red-600 hover:text-red-900">Delete</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = table;
}

// Create new quiz
function createQuiz() {
    const title = document.getElementById('quizTitle').value.trim();
    const description = document.getElementById('quizDescription').value.trim();
    const startDate = document.getElementById('quizDate').value;
    const startTime = document.getElementById('quizTime').value;
    const instructionMinutes = parseInt(document.getElementById('instructionMinutes').value);
    const quizMinutes = parseInt(document.getElementById('quizMinutes').value);
    const totalQuestions = parseInt(document.getElementById('totalQuestions').value);
    const isActive = document.getElementById('isActive').checked;
    
    if (!title || !startDate || !startTime) {
        showToast('Please fill all required fields', 'error');
        return;
    }
    
    showLoading();
    
    fetch('/api/admin/quizzes', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            title,
            description,
            start_date: startDate,
            start_time: startTime,
            instruction_time_minutes: instructionMinutes,
            quiz_time_minutes: quizMinutes,
            total_questions: totalQuestions,
            is_active: isActive
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast('Quiz created successfully', 'success');
            closeModal('createQuizModal');
            document.getElementById('createQuizForm').reset();
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

// Edit quiz
function editQuiz(quizId) {
    showLoading();
    
    fetch(`/api/admin/quizzes/${quizId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const quiz = data.data;
            
            // Populate form fields
            document.getElementById('editQuizId').value = quiz.id;
            document.getElementById('editQuizTitle').value = quiz.title || '';
            document.getElementById('editQuizDescription').value = quiz.description || '';
            document.getElementById('editQuizDate').value = quiz.start_date || '';
            document.getElementById('editQuizTime').value = quiz.start_time || '';
            document.getElementById('editInstructionMinutes').value = quiz.instruction_time_minutes || 5;
            document.getElementById('editQuizMinutes').value = quiz.quiz_time_minutes || 15;
            document.getElementById('editTotalQuestions').value = quiz.total_questions || 20;
            document.getElementById('editIsActive').checked = quiz.is_active || false;
            
            openModal('editQuizModal');
        } else {
            showToast(data.message || 'Failed to get quiz details', 'error');
        }
    })
    .catch(error => {
        console.error('Get quiz error:', error);
        showToast('Failed to get quiz details', 'error');
    })
    .finally(() => {
        hideLoading();
    });
}

// Update quiz
function updateQuiz() {
    const quizId = document.getElementById('editQuizId').value;
    const title = document.getElementById('editQuizTitle').value.trim();
    const description = document.getElementById('editQuizDescription').value.trim();
    const startDate = document.getElementById('editQuizDate').value;
    const startTime = document.getElementById('editQuizTime').value;
    const instructionMinutes = parseInt(document.getElementById('editInstructionMinutes').value);
    const quizMinutes = parseInt(document.getElementById('editQuizMinutes').value);
    const totalQuestions = parseInt(document.getElementById('editTotalQuestions').value);
    const isActive = document.getElementById('editIsActive').checked;
    
    if (!title || !startDate || !startTime) {
        showToast('Please fill all required fields', 'error');
        return;
    }
    
    showLoading();
    
    fetch(`/api/admin/quizzes/${quizId}`, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            title,
            description,
            start_date: startDate,
            start_time: startTime,
            instruction_time_minutes: instructionMinutes,
            quiz_time_minutes: quizMinutes,
            total_questions: totalQuestions,
            is_active: isActive
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast('Quiz updated successfully', 'success');
            closeModal('editQuizModal');
            loadQuizzes();
        } else {
            showToast(data.message || 'Failed to update quiz', 'error');
        }
    })
    .catch(error => {
        console.error('Update quiz error:', error);
        showToast('Failed to update quiz', 'error');
    })
    .finally(() => {
        hideLoading();
    });
}

// Toggle quiz status
function toggleQuizStatus(quizId, quizTitle, isActive) {
    const action = isActive ? 'deactivate' : 'activate';
    const confirmMessage = `Are you sure you want to ${action} the quiz "${quizTitle}"?`;
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    showLoading();
    
    fetch(`/api/admin/quizzes/${quizId}/toggle-status`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${authToken}` }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast(data.message, 'success');
            loadQuizzes();
        } else {
            showToast(data.message || 'Failed to update quiz status', 'error');
        }
    })
    .catch(error => {
        console.error('Toggle quiz status error:', error);
        showToast('Failed to update quiz status', 'error');
    })
    .finally(() => {
        hideLoading();
    });
}

// Delete quiz
function deleteQuiz(quizId, quizTitle) {
    const confirmMessage = `Are you sure you want to delete the quiz "${quizTitle}"?\n\nThis action cannot be undone and will also delete all associated questions.`;
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    showLoading();
    
    fetch(`/api/admin/quizzes/${quizId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast('Quiz deleted successfully', 'success');
            loadQuizzes();
        } else {
            showToast(data.message || 'Failed to delete quiz', 'error');
        }
    })
    .catch(error => {
        console.error('Delete quiz error:', error);
        showToast('Failed to delete quiz', 'error');
    })
    .finally(() => {
        hideLoading();
    });
}

// Manage questions
function manageQuestions(quizId, quizTitle) {
    currentQuizForQuestions = quizId;
    document.getElementById('questionsQuizTitle').textContent = quizTitle;
    loadQuestions(quizId);
    openModal('manageQuestionsModal');
}

// Update quizzes pagination (similar to participants)
function updateQuizzesPagination(pagination) {
    const container = document.getElementById('quizzes-pagination');
    
    if (pagination.totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    // Similar pagination structure as participants
    let paginationHtml = `
        <div class="flex items-center justify-between">
            <div class="flex-1 flex justify-between sm:hidden">
                <button ${pagination.page === 1 ? 'disabled' : ''} onclick="loadQuizzes(${pagination.page - 1})" 
                        class="mr-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">
                    Previous
                </button>
                <button ${pagination.page === pagination.totalPages ? 'disabled' : ''} onclick="loadQuizzes(${pagination.page + 1})" 
                        class="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">
                    Next
                </button>
            </div>
            <div class="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                    <p class="text-sm text-gray-700">
                        Showing <span class="font-medium">${(pagination.page - 1) * pagination.limit + 1}</span> to 
                        <span class="font-medium">${Math.min(pagination.page * pagination.limit, pagination.total)}</span> of 
                        <span class="font-medium">${pagination.total}</span> results
                    </p>
                </div>
                <div>
                    <nav class="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
    `;
    
    // Previous button
    paginationHtml += `
        <button ${pagination.page === 1 ? 'disabled' : ''} onclick="loadQuizzes(${pagination.page - 1})"
                class="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50">
            <i class="fas fa-chevron-left"></i>
        </button>
    `;
    
    // Page numbers
    for (let i = 1; i <= pagination.totalPages; i++) {
        if (i === pagination.page) {
            paginationHtml += `
                <button class="relative inline-flex items-center px-4 py-2 border border-blue-500 bg-blue-50 text-sm font-medium text-blue-600">
                    ${i}
                </button>
            `;
        } else if (i === 1 || i === pagination.totalPages || (i >= pagination.page - 2 && i <= pagination.page + 2)) {
            paginationHtml += `
                <button onclick="loadQuizzes(${i})" 
                        class="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50">
                    ${i}
                </button>
            `;
        } else if (i === pagination.page - 3 || i === pagination.page + 3) {
            paginationHtml += `
                <span class="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                    ...
                </span>
            `;
        }
    }
    
    // Next button
    paginationHtml += `
        <button ${pagination.page === pagination.totalPages ? 'disabled' : ''} onclick="loadQuizzes(${pagination.page + 1})"
                class="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50">
            <i class="fas fa-chevron-right"></i>
        </button>
    `;
    
    paginationHtml += `
                    </nav>
                </div>
            </div>
        </div>
    `;
    
    container.innerHTML = paginationHtml;
}

// Utility function for date formatting
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
}

// Load quiz questions
function loadQuestions(quizId) {
    showLoading();
    
    fetch(`/api/admin/quizzes/${quizId}/questions`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            displayQuestions(data.data);
        } else {
            showToast(data.message || 'Failed to load questions', 'error');
        }
    })
    .catch(error => {
        console.error('Load questions error:', error);
        showToast('Failed to load questions', 'error');
    })
    .finally(() => {
        hideLoading();
    });
}

// Question management functions
function displayQuestions(questions) {
    const questionsContainer = document.getElementById('questionsContainer');
    const questionsCount = document.getElementById('questionsCount');
    
    // Update question count
    questionsCount.textContent = questions ? questions.length : 0;
    
    if (!questions || questions.length === 0) {
        questionsContainer.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <i class="fas fa-question-circle text-4xl mb-4"></i>
                <p class="text-lg">No questions found</p>
                <p class="text-sm">Click "Add Question" to create questions for this quiz</p>
            </div>
        `;
        return;
    }
    
    questionsContainer.innerHTML = questions.map((question, index) => `
        <div class="bg-gray-50 rounded-lg p-4 mb-4 question-item" data-question-id="${question.id || ''}">
            <div class="flex justify-between items-start mb-3">
                <h4 class="text-lg font-medium text-gray-900">Question ${index + 1}</h4>
                <button onclick="removeQuestion(${index})" class="text-red-600 hover:text-red-800">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            
            <div class="space-y-3">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Question Text</label>
                    <textarea 
                        class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        rows="3"
                        placeholder="Enter question text"
                        onchange="updateQuestionData(${index}, 'question_text', this.value)"
                    >${question.question_text || ''}</textarea>
                </div>
                
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Option A</label>
                        <input 
                            type="text" 
                            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Option A"
                            value="${question.option_a || ''}"
                            onchange="updateQuestionData(${index}, 'option_a', this.value)"
                        >
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Option B</label>
                        <input 
                            type="text" 
                            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Option B"
                            value="${question.option_b || ''}"
                            onchange="updateQuestionData(${index}, 'option_b', this.value)"
                        >
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Option C</label>
                        <input 
                            type="text" 
                            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Option C"
                            value="${question.option_c || ''}"
                            onchange="updateQuestionData(${index}, 'option_c', this.value)"
                        >
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Option D</label>
                        <input 
                            type="text" 
                            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Option D"
                            value="${question.option_d || ''}"
                            onchange="updateQuestionData(${index}, 'option_d', this.value)"
                        >
                    </div>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Correct Answer</label>
                    <select 
                        class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onchange="updateQuestionData(${index}, 'correct_answer', this.value)"
                    >
                        <option value="">Select correct answer</option>
                        <option value="a" ${question.correct_answer === 'a' ? 'selected' : ''}>Option A</option>
                        <option value="b" ${question.correct_answer === 'b' ? 'selected' : ''}>Option B</option>
                        <option value="c" ${question.correct_answer === 'c' ? 'selected' : ''}>Option C</option>
                        <option value="d" ${question.correct_answer === 'd' ? 'selected' : ''}>Option D</option>
                    </select>
                </div>
            </div>
        </div>
    `).join('');
}

let questionsData = [];

function updateQuestionData(index, field, value) {
    if (!questionsData[index]) {
        questionsData[index] = {};
    }
    questionsData[index][field] = value;
}

function addNewQuestion() {
    const newQuestion = {
        question_text: '',
        option_a: '',
        option_b: '',
        option_c: '',
        option_d: '',
        correct_answer: ''
    };
    
    questionsData.push(newQuestion);
    displayQuestions(questionsData);
    
    // Scroll to the new question
    const questionsContainer = document.getElementById('questionsContainer');
    questionsContainer.scrollTop = questionsContainer.scrollHeight;
}

function removeQuestion(index) {
    if (confirm('Are you sure you want to remove this question?')) {
        questionsData.splice(index, 1);
        displayQuestions(questionsData);
    }
}

async function saveAllQuestions() {
    const quizId = document.getElementById('questionsQuizId').value;
    
    if (!quizId) {
        showToast('Quiz ID not found', 'error');
        return;
    }
    
    // Enhanced validation
    const validQuestions = [];
    let allErrors = [];
    
    for (let i = 0; i < questionsData.length; i++) {
        const q = questionsData[i];
        const errors = validateQuestion(q, i);
        
        if (errors.length > 0) {
            allErrors = allErrors.concat(errors);
        } else {
            validQuestions.push(q);
        }
    }
    
    if (allErrors.length > 0) {
        // Show first few errors
        const errorMessage = allErrors.slice(0, 3).join('\n') + (allErrors.length > 3 ? `\n... and ${allErrors.length - 3} more errors` : '');
        showToast(errorMessage, 'error');
        return;
    }
    
    if (validQuestions.length === 0) {
        showToast('Please add at least one question', 'error');
        return;
    }
    
    showLoading();
    
    try {
        const response = await fetch(`/api/admin/quizzes/${quizId}/questions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ questions: validQuestions })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast(data.message, 'success');
            closeModal('manageQuestionsModal');
            loadQuizzes(); // Refresh the quiz list to show updated question count
        } else {
            showToast(data.message || 'Failed to save questions', 'error');
        }
    } catch (error) {
        console.error('Save questions error:', error);
        showToast('Failed to save questions', 'error');
    } finally {
        hideLoading();
    }
}

function manageQuestions(quizId, quizTitle) {
    document.getElementById('questionsQuizId').value = quizId;
    document.getElementById('questionsQuizTitle').textContent = quizTitle;
    
    // Reset questions data
    questionsData = [];
    
    // Load existing questions
    loadQuestions(quizId);
    
    openModal('manageQuestionsModal');
}

// Override the loadQuestions function to populate questionsData
async function loadQuestions(quizId) {
    showLoading();
    
    try {
        const response = await fetch(`/api/admin/quizzes/${quizId}/questions`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            questionsData = data.data || [];
            displayQuestions(questionsData);
        } else {
            showToast(data.message || 'Failed to load questions', 'error');
            questionsData = [];
            displayQuestions([]);
        }
    } catch (error) {
        console.error('Load questions error:', error);
        showToast('Failed to load questions', 'error');
        questionsData = [];
        displayQuestions([]);
    } finally {
        hideLoading();
    }
}

// Enhanced Question Management Functions

// Question templates for different categories
const questionTemplates = {
    epf: {
        question_text: "Which one of the following is not coming under EPF?",
        option_a: "UAN (Universal Account Number)",
        option_b: "PPO (Provident Fund Office)",
        option_c: "EPS (Employee Pension Scheme)",
        option_d: "None of these",
        correct_answer: "d"
    },
    esi: {
        question_text: "What is the contribution rate for ESI scheme by employee?",
        option_a: "0.75% of wages",
        option_b: "1.75% of wages", 
        option_c: "3.25% of wages",
        option_d: "4.75% of wages",
        correct_answer: "a"
    },
    posh: {
        question_text: "Under POSH Act, Internal Committee should be constituted if workplace has:",
        option_a: "5 or more employees",
        option_b: "10 or more employees",
        option_c: "15 or more employees",
        option_d: "20 or more employees",
        correct_answer: "b"
    },
    bonus: {
        question_text: "Payment of Bonus Act applies to establishments employing:",
        option_a: "10 or more persons",
        option_b: "20 or more persons",
        option_c: "30 or more persons",
        option_d: "50 or more persons",
        correct_answer: "b"
    },
    wages: {
        question_text: "Minimum wage rates are revised every:",
        option_a: "3 years",
        option_b: "4 years",
        option_c: "5 years",
        option_d: "6 years",
        correct_answer: "c"
    }
};

function addQuestionFromTemplate() {
    const templates = Object.keys(questionTemplates);
    const templateOptions = templates.map(key => `<option value="${key}">${key.toUpperCase()}</option>`).join('');
    
    const modalHtml = `
        <div class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50" id="templateModal">
            <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                <div class="mt-3">
                    <h3 class="text-lg font-medium text-gray-900 mb-4">Select Question Template</h3>
                    <select id="templateSelect" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4">
                        <option value="">Choose template category...</option>
                        ${templateOptions}
                    </select>
                    <div class="flex justify-end space-x-3">
                        <button onclick="closeTemplateModal()" class="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                        <button onclick="applyTemplate()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Add Template</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function applyTemplate() {
    const templateKey = document.getElementById('templateSelect').value;
    if (!templateKey) {
        showToast('Please select a template', 'error');
        return;
    }
    
    const template = questionTemplates[templateKey];
    questionsData.push({ ...template });
    displayQuestions(questionsData);
    closeTemplateModal();
    showToast('Template question added successfully', 'success');
}

function closeTemplateModal() {
    const modal = document.getElementById('templateModal');
    if (modal) {
        modal.remove();
    }
}

function toggleBulkUpload() {
    const section = document.getElementById('bulkUploadSection');
    section.classList.toggle('hidden');
}

function uploadQuestionsFile() {
    const fileInput = document.getElementById('questionsFile');
    const file = fileInput.files[0];
    
    if (!file) {
        showToast('Please select a file to upload', 'error');
        return;
    }
    
    const quizId = document.getElementById('questionsQuizId').value;
    const formData = new FormData();
    formData.append('questionsFile', file);
    
    showLoading();
    
    fetch(`/api/admin/quizzes/${quizId}/questions/upload`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${authToken}`
        },
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast(data.message, 'success');
            loadQuestions(quizId); // Reload questions to show uploaded ones
            toggleBulkUpload(); // Hide upload section
            fileInput.value = ''; // Clear file input
        } else {
            showToast(data.message || 'Failed to upload questions', 'error');
        }
    })
    .catch(error => {
        console.error('Upload questions error:', error);
        showToast('Failed to upload questions', 'error');
    })
    .finally(() => {
        hideLoading();
    });
}

function downloadTemplate() {
    const csvContent = `question_text,option_a,option_b,option_c,option_d,correct_answer
"Which one of the following is not coming under EPF?","UAN (Universal Account Number)","PPO (Provident Fund Office)","EPS (Employee Pension Scheme)","None of these",d
"What is the contribution rate for ESI scheme by employee?","0.75% of wages","1.75% of wages","3.25% of wages","4.75% of wages",1
"Under POSH Act, Internal Committee should be constituted if workplace has:","5 or more employees","10 or more employees","15 or more employees","20 or more employees",2
"Payment of Bonus Act applies to establishments employing:","10 or more persons","20 or more persons","30 or more persons","50 or more persons",b
"Minimum wage rates are revised every:","3 years","4 years","5 years","6 years",3`;
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'questions_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
    showToast('Template downloaded successfully', 'success');
}

function clearAllQuestions() {
    if (questionsData.length === 0) {
        showToast('No questions to clear', 'info');
        return;
    }
    
    if (confirm(`Are you sure you want to clear all ${questionsData.length} questions? This action cannot be undone.`)) {
        questionsData = [];
        displayQuestions(questionsData);
        showToast('All questions cleared', 'success');
    }
}

// Enhanced question validation
function validateQuestion(question, index) {
    const errors = [];
    
    if (!question.question_text || question.question_text.trim().length < 10) {
        errors.push(`Question ${index + 1}: Question text must be at least 10 characters long`);
    }
    
    if (!question.option_a || question.option_a.trim().length < 1) {
        errors.push(`Question ${index + 1}: Option A is required`);
    }
    
    if (!question.option_b || question.option_b.trim().length < 1) {
        errors.push(`Question ${index + 1}: Option B is required`);
    }
    
    if (!question.option_c || question.option_c.trim().length < 1) {
        errors.push(`Question ${index + 1}: Option C is required`);
    }
    
    if (!question.option_d || question.option_d.trim().length < 1) {
        errors.push(`Question ${index + 1}: Option D is required`);
    }
    
    if (!question.correct_answer || !['a', 'b', 'c', 'd'].includes(question.correct_answer.toLowerCase())) {
        errors.push(`Question ${index + 1}: Please select a valid correct answer (A, B, C, or D)`);
    }
    
    // Check for duplicate options
    const options = [question.option_a, question.option_b, question.option_c, question.option_d];
    const uniqueOptions = [...new Set(options)];
    if (uniqueOptions.length !== options.length) {
        errors.push(`Question ${index + 1}: All options must be unique`);
    }
    
    return errors;
}

// Update the addNewQuestion function to scroll to the new question
function addNewQuestion() {
    const newQuestion = {
        question_text: '',
        option_a: '',
        option_b: '',
        option_c: '',
        option_d: '',
        correct_answer: ''
    };
    
    questionsData.push(newQuestion);
    displayQuestions(questionsData);
    
    // Scroll to the new question
    const questionsContainer = document.getElementById('questionsContainer');
    questionsContainer.scrollTop = questionsContainer.scrollHeight;
    
    // Focus on the question text field of the new question
    setTimeout(() => {
        const questionItems = questionsContainer.querySelectorAll('.question-item');
        const lastQuestion = questionItems[questionItems.length - 1];
        if (lastQuestion) {
            const textarea = lastQuestion.querySelector('textarea');
            if (textarea) {
                textarea.focus();
            }
        }
    }, 100);
}

// Session Management Functions

// Load sessions data
async function loadSessions() {
    const search = document.getElementById('sessionSearch')?.value || '';
    const status = document.getElementById('sessionStatusFilter')?.value || '';
    
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (status) params.append('status', status);
    
    try {
        const response = await fetch(`/api/admin/sessions?${params}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            updateSessionsTable(data.data);
            updateSessionsPageStats(data.stats);
        } else {
            showToast(data.message || 'Failed to load sessions', 'error');
        }
    } catch (error) {
        console.error('Load sessions error:', error);
        showToast('Failed to load sessions', 'error');
    }
}

// Update sessions table
function updateSessionsTable(sessions) {
    const container = document.getElementById('sessions-table-container');
    
    if (sessions.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <i class="fas fa-play-circle text-4xl mb-4"></i>
                <p class="text-lg">No sessions found</p>
                <p class="text-sm">Create your first quiz session to get started</p>
            </div>
        `;
        return;
    }
    
    const table = `
        <table class="min-w-full">
            <thead class="bg-gray-50">
                <tr>
                    <th class="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Session</th>
                    <th class="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quiz</th>
                    <th class="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Schedule</th>
                    <th class="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Participants</th>
                    <th class="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th class="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
                ${sessions.map(session => `
                    <tr class="hover:bg-gray-50">
                        <td class="py-4 px-6">
                            <div>
                                <div class="text-sm font-medium text-gray-900">${session.title}</div>
                                <div class="text-sm text-gray-500">${session.description || 'No description'}</div>
                            </div>
                        </td>
                        <td class="py-4 px-6">
                            <div class="text-sm text-gray-900">${session.quiz_title}</div>
                            <div class="text-sm text-gray-500">${session.total_questions} questions</div>
                        </td>
                        <td class="py-4 px-6">
                            <div class="text-sm text-gray-900">${formatDate(session.scheduled_date)}</div>
                            <div class="text-sm text-gray-500">${session.scheduled_time}</div>
                        </td>
                        <td class="py-4 px-6">
                            <div class="text-sm text-gray-900">${session.connected_participants || 0}/${session.max_participants}</div>
                            <div class="text-sm text-gray-500">Max: ${session.max_participants}</div>
                        </td>
                        <td class="py-4 px-6">
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSessionStatusColor(session.status)}">
                                ${getSessionStatusLabel(session.status)}
                            </span>
                        </td>
                        <td class="py-4 px-6 text-sm font-medium space-x-2">
                            ${getSessionActions(session)}
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = table;
}

// Update sessions page statistics
function updateSessionsPageStats(stats) {
    if (!stats) return;
    
    // Update the stats display elements
    if (document.getElementById('sessionsActiveCount')) {
        document.getElementById('sessionsActiveCount').textContent = stats.active || 0;
    }
    if (document.getElementById('sessionsCompletedCount')) {
        document.getElementById('sessionsCompletedCount').textContent = stats.completed || 0;
    }
    if (document.getElementById('sessionsScheduledTodayCount')) {
        document.getElementById('sessionsScheduledTodayCount').textContent = stats.scheduled_today || 0;
    }
    if (document.getElementById('liveParticipantsCount')) {
        document.getElementById('liveParticipantsCount').textContent = stats.live_participants || 0;
    }
}

// Get session status color
function getSessionStatusColor(status) {
    const colors = {
        'scheduled': 'bg-yellow-100 text-yellow-800',
        'instruction': 'bg-blue-100 text-blue-800',
        'active': 'bg-green-100 text-green-800',
        'completed': 'bg-purple-100 text-purple-800',
        'cancelled': 'bg-red-100 text-red-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
}

// Get session status label
function getSessionStatusLabel(status) {
    const labels = {
        'scheduled': 'Scheduled',
        'instruction': 'Instruction Phase',
        'active': 'Live Quiz',
        'completed': 'Completed',
        'cancelled': 'Cancelled'
    };
    return labels[status] || 'Unknown';
}

// Get session actions based on status
function getSessionActions(session) {
    const actions = [];
    
    if (session.status === 'scheduled') {
        actions.push(`<button onclick="monitorSession(${session.id})" class="text-blue-600 hover:text-blue-900">Monitor</button>`);
        actions.push(`<button onclick="editSession(${session.id})" class="text-green-600 hover:text-green-900">Edit</button>`);
        actions.push(`<button onclick="deleteSession(${session.id}, '${session.title}')" class="text-red-600 hover:text-red-900">Delete</button>`);
    } else if (session.status === 'instruction' || session.status === 'active') {
        actions.push(`<button onclick="monitorSession(${session.id})" class="text-green-600 hover:text-green-900 font-medium">Live Monitor</button>`);
    } else {
        actions.push(`<button onclick="viewSessionResults(${session.id})" class="text-blue-600 hover:text-blue-900">Results</button>`);
        actions.push(`<button onclick="deleteSession(${session.id}, '${session.title}')" class="text-red-600 hover:text-red-900">Delete</button>`);
    }
    
    return actions.join(' ');
}

// Update session statistics
function updateSessionStats(stats) {
    if (stats) {
        document.getElementById('active-sessions-count').textContent = stats.active || 0;
        document.getElementById('live-participants-count').textContent = stats.live_participants || 0;
        document.getElementById('scheduled-today-count').textContent = stats.scheduled_today || 0;
        document.getElementById('completed-sessions-count').textContent = stats.completed || 0;
    }
}

// Create new session
async function createSession(event) {
    event.preventDefault();
    
    const title = document.getElementById('sessionTitle').value.trim();
    const quizId = document.getElementById('sessionQuiz').value;
    const scheduledDate = document.getElementById('sessionDate').value;
    const scheduledTime = document.getElementById('sessionTime').value;
    const maxParticipants = parseInt(document.getElementById('sessionMaxParticipants').value);
    const instructionTime = parseInt(document.getElementById('sessionInstructionTime').value);
    const description = document.getElementById('sessionDescription').value.trim();
    const autoStart = document.getElementById('sessionAutoStart').checked;
    
    if (!title || !quizId || !scheduledDate || !scheduledTime) {
        showToast('Please fill in all required fields', 'error');
        return;
    }
    
    showLoading();
    
    try {
        const response = await fetch('/api/admin/sessions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                title,
                quiz_id: quizId,
                scheduled_date: scheduledDate,
                scheduled_time: scheduledTime,
                max_participants: maxParticipants,
                instruction_time_minutes: instructionTime,
                description,
                auto_start: autoStart
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Session created successfully', 'success');
            closeModal('createSessionModal');
            document.getElementById('createSessionForm').reset();
            loadSessions();
        } else {
            showToast(data.message || 'Failed to create session', 'error');
        }
    } catch (error) {
        console.error('Create session error:', error);
        showToast('Failed to create session', 'error');
    } finally {
        hideLoading();
    }
}

// Monitor session (open live monitor)
function monitorSession(sessionId) {
    console.log('monitorSession called with:', sessionId, typeof sessionId);
    
    // Validate sessionId
    if (!sessionId || typeof sessionId === 'object') {
        console.error('Invalid sessionId passed to monitorSession:', sessionId);
        showToast('Invalid session ID', 'error');
        return;
    }
    
    // Ensure sessionId is a valid number
    const validSessionId = parseInt(sessionId);
    if (isNaN(validSessionId)) {
        console.error('Session ID is not a valid number:', sessionId);
        showToast('Invalid session ID', 'error');
        return;
    }
    
    // Store current session ID for monitoring
    window.currentSessionId = validSessionId;
    
    // Load session data and open monitor modal
    loadSessionMonitor(validSessionId);
    openModal('sessionMonitorModal');
}

// Load session monitor data
async function loadSessionMonitor(sessionId) {
    try {
        const response = await fetch(`/api/admin/sessions/${sessionId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            const session = data.data;
            
            // Update monitor modal with session data
            document.getElementById('monitorSessionTitle').textContent = session.title;
            document.getElementById('monitorSessionStatus').textContent = `Status: ${getSessionStatusLabel(session.status)}`;
            
            // Show/hide appropriate control buttons
            updateSessionControls(session.status);
            
            // Start real-time updates
            startSessionMonitoring(sessionId);
        } else {
            showToast(data.message || 'Failed to load session data', 'error');
        }
    } catch (error) {
        console.error('Load session monitor error:', error);
        showToast('Failed to load session data', 'error');
    }
}

// Update session control buttons based on status
function updateSessionControls(status) {
    const startInstructionBtn = document.getElementById('startInstructionBtn');
    const startQuizBtn = document.getElementById('startQuizBtn');
    const endSessionBtn = document.getElementById('endSessionBtn');
    
    // Hide all buttons first
    [startInstructionBtn, startQuizBtn, endSessionBtn].forEach(btn => btn.classList.add('hidden'));
    
    // Show appropriate buttons based on status
    if (status === 'scheduled') {
        startInstructionBtn.classList.remove('hidden');
    } else if (status === 'instruction') {
        startQuizBtn.classList.remove('hidden');
        endSessionBtn.classList.remove('hidden');
    } else if (status === 'active') {
        endSessionBtn.classList.remove('hidden');
    }
}

// Start real-time session monitoring
function startSessionMonitoring(sessionId) {
    console.log('Starting session monitoring for:', sessionId, typeof sessionId);
    
    // Stop any existing monitoring first
    stopSessionMonitoring();
    
    // Ensure sessionId is valid
    if (!sessionId || sessionId === 'undefined' || sessionId === '[object Object]') {
        console.error('Invalid sessionId for monitoring:', sessionId);
        return;
    }
    
    // Store session ID for interval use
    const validSessionId = sessionId.toString();
    
    // Start smart polling with adaptive intervals
    startSmartMonitoring(validSessionId);
    
    // Store session ID for cleanup
    window.currentSessionId = validSessionId;
}

// Smart monitoring with adaptive intervals
let adminPollingInterval = 20000; // Start with 20 seconds
let adminMaxPollingInterval = 120000; // Max 2 minutes
let adminPollingTimeoutId = null;

function startSmartMonitoring(sessionId) {
    adminPollingTimeoutId = setTimeout(async () => {
        try {
            console.log('Monitoring interval - using sessionId:', sessionId);
            await updateSessionStats(sessionId);
            await updateParticipantsList(sessionId);
            
            // Reset interval on success
            adminPollingInterval = 20000;
            
        } catch (error) {
            // Exponential backoff on error
            adminPollingInterval = Math.min(adminPollingInterval * 1.5, adminMaxPollingInterval);
            console.warn(`Admin polling error, increasing interval to ${adminPollingInterval}ms`);
        }
        
        // Continue monitoring
        startSmartMonitoring(sessionId);
        
    }, adminPollingInterval);
    
    // Store timeout ID for cleanup
    window.currentMonitoringInterval = adminPollingTimeoutId;
}

// Stop session monitoring
function stopSessionMonitoring() {
    if (window.currentMonitoringInterval) {
        clearTimeout(window.currentMonitoringInterval);
        window.currentMonitoringInterval = null;
    }
    if (adminPollingTimeoutId) {
        clearTimeout(adminPollingTimeoutId);
        adminPollingTimeoutId = null;
    }
}

// Update session statistics in monitor
async function updateSessionStats(sessionId) {
    try {
        const response = await fetch(`/api/admin/sessions/${sessionId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        // Handle rate limiting
        if (response.status === 429) {
            console.warn('Rate limited - skipping session stats update');
            return;
        }
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            const session = data.data;
            
            // Update status
            document.getElementById('monitorSessionStatus').textContent = `Status: ${getSessionStatusLabel(session.status)}`;
            
            // Update stats
            document.getElementById('liveParticipants').textContent = session.current_participants || 0;
            
            // Update timer if active
            if (session.status === 'active' && session.quiz_start_time) {
                updateSessionTimer(session.quiz_start_time);
            } else if (session.status === 'instruction' && session.instruction_start_time) {
                updateInstructionTimer(session.instruction_start_time);
            }
            
            // Update control buttons
            updateSessionControls(session.status);
        }
    } catch (error) {
        console.error('Update session stats error:', error);
    }
}

// Update participants list in monitor
async function updateParticipantsList(sessionId) {
    try {
        const response = await fetch(`/api/admin/sessions/${sessionId}/participants`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        // Handle rate limiting
        if (response.status === 429) {
            console.warn('Rate limited - skipping participants list update');
            return;
        }
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            const participants = data.data;
            const container = document.getElementById('liveParticipantsTable');
            
            if (participants.length === 0) {
                container.innerHTML = '<div class="text-center py-4 text-gray-500">No participants yet</div>';
                return;
            }
            
            container.innerHTML = participants.map(participant => `
                <div class="flex justify-between items-center py-2 px-3 border-b border-gray-100">
                    <div>
                        <div class="font-medium">${participant.name}</div>
                        <div class="text-sm text-gray-500">${participant.company || ''}</div>
                    </div>
                    <div class="text-right">
                        <div class="text-sm ${getParticipantStatusColor(participant.status)}">${getParticipantStatusLabel(participant.status)}</div>
                        <div class="text-xs text-gray-400">${formatTime(participant.joined_at)}</div>
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Update participants list error:', error);
    }
}

// Update session timer display
function updateSessionTimer(startTime) {
    const start = new Date(startTime);
    const now = new Date();
    const elapsed = now - start;
    const duration = 15 * 60 * 1000; // 15 minutes
    const remaining = Math.max(0, duration - elapsed);
    
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    
    const timerElement = document.getElementById('sessionTimer');
    if (timerElement) {
        timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        timerElement.className = remaining < 60000 ? 'text-red-600 font-bold' : 'text-green-600';
    }
}

// Update instruction timer display
function updateInstructionTimer(startTime) {
    const start = new Date(startTime);
    const now = new Date();
    const elapsed = now - start;
    const duration = 5 * 60 * 1000; // 5 minutes
    const remaining = Math.max(0, duration - elapsed);
    
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    
    const timerElement = document.getElementById('instructionTimer');
    if (timerElement) {
        timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

// Get participant status label
function getParticipantStatusLabel(status) {
    const labels = {
        'joined': 'Joined',
        'started': 'In Progress',
        'submitted': 'Completed',
        'timeout': 'Timed Out'
    };
    return labels[status] || status;
}

// Get participant status color
function getParticipantStatusColor(status) {
    const colors = {
        'joined': 'text-blue-600',
        'started': 'text-yellow-600',
        'submitted': 'text-green-600',
        'timeout': 'text-red-600'
    };
    return colors[status] || 'text-gray-600';
}

// Format time for display
function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
    });
}

// Session control actions
async function startInstruction(sessionId) {
    console.log('startInstruction called with:', sessionId, typeof sessionId);
    
    // Use stored session ID if parameter is invalid
    const validSessionId = sessionId || window.currentSessionId;
    
    if (!validSessionId || typeof validSessionId === 'object') {
        showToast('No valid session selected', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/sessions/${validSessionId}/start-instruction`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Instruction phase started', 'success');
            await updateSessionStats(validSessionId);
        } else {
            showToast(data.message || 'Failed to start instruction phase', 'error');
        }
    } catch (error) {
        console.error('Start instruction error:', error);
        showToast('Failed to start instruction phase', 'error');
    }
}

async function startQuiz(sessionId) {
    console.log('startQuiz called with:', sessionId, typeof sessionId);
    
    // Use stored session ID if parameter is invalid
    const validSessionId = sessionId || window.currentSessionId;
    
    if (!validSessionId || typeof validSessionId === 'object') {
        showToast('No valid session selected', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/sessions/${validSessionId}/start-quiz`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Quiz started', 'success');
            await updateSessionStats(validSessionId);
        } else {
            showToast(data.message || 'Failed to start quiz', 'error');
        }
    } catch (error) {
        console.error('Start quiz error:', error);
        showToast('Failed to start quiz', 'error');
    }
}

async function endSession(sessionId) {
    console.log('endSession called with:', sessionId, typeof sessionId);
    
    // Use stored session ID if parameter is invalid
    const validSessionId = sessionId || window.currentSessionId;
    
    if (!validSessionId || typeof validSessionId === 'object') {
        showToast('No valid session selected', 'error');
        return;
    }
    
    if (!confirm('Are you sure you want to end this session? This action cannot be undone.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/sessions/${validSessionId}/end`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Session ended', 'success');
            await updateSessionStats(validSessionId);
            stopSessionMonitoring();
            closeModal('sessionMonitorModal');
            loadSessions(); // Refresh sessions list
        } else {
            showToast(data.message || 'Failed to end session', 'error');
        }
    } catch (error) {
        console.error('End session error:', error);
        showToast('Failed to end session', 'error');
    }
}

// Edit session
async function editSession(sessionId) {
    try {
        // Load session data
        const response = await fetch(`/api/admin/sessions/${sessionId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            const session = data.data;
            
            // Populate edit form
            document.getElementById('editSessionId').value = session.id;
            document.getElementById('editSessionTitle').value = session.session_name;
            document.getElementById('editSessionQuiz').value = session.quiz_id;
            document.getElementById('editSessionDate').value = session.scheduled_date;
            document.getElementById('editSessionTime').value = session.scheduled_time;
            document.getElementById('editSessionMaxParticipants').value = session.max_participants;
            
            // Load quizzes for dropdown
            await loadQuizzesForSessionEdit();
            
            // Set the selected quiz
            document.getElementById('editSessionQuiz').value = session.quiz_id;
            
            openModal('editSessionModal');
        } else {
            showToast(data.message || 'Failed to load session data', 'error');
        }
    } catch (error) {
        console.error('Edit session error:', error);
        showToast('Failed to load session data', 'error');
    }
}

// Delete session
async function deleteSession(sessionId, sessionTitle) {
    const confirmMessage = sessionTitle 
        ? `Are you sure you want to delete "${sessionTitle}"? This action cannot be undone.`
        : 'Are you sure you want to delete this session? This action cannot be undone.';
        
    if (!confirm(confirmMessage)) {
        return;
    }
    
    try {
        showLoading();
        
        const response = await fetch(`/api/admin/sessions/${sessionId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Session deleted successfully', 'success');
            loadSessions(); // Refresh sessions list
        } else {
            showToast(data.message || 'Failed to delete session', 'error');
        }
    } catch (error) {
        console.error('Delete session error:', error);
        showToast('Failed to delete session', 'error');
    } finally {
        hideLoading();
    }
}

// Update session
async function updateSession(event) {
    event.preventDefault();
    
    const sessionId = document.getElementById('editSessionId').value;
    const title = document.getElementById('editSessionTitle').value.trim();
    const quizId = document.getElementById('editSessionQuiz').value;
    const scheduledDate = document.getElementById('editSessionDate').value;
    const scheduledTime = document.getElementById('editSessionTime').value;
    const maxParticipants = parseInt(document.getElementById('editSessionMaxParticipants').value);
    
    if (!title || !quizId || !scheduledDate || !scheduledTime || !maxParticipants) {
        showToast('Please fill in all required fields', 'error');
        return;
    }
    
    try {
        showLoading();
        
        const response = await fetch(`/api/admin/sessions/${sessionId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                title,
                quiz_id: quizId,
                scheduled_date: scheduledDate,
                scheduled_time: scheduledTime,
                max_participants: maxParticipants
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Session updated successfully', 'success');
            closeModal('editSessionModal');
            document.getElementById('editSessionForm').reset();
            loadSessions();
        } else {
            showToast(data.message || 'Failed to update session', 'error');
        }
    } catch (error) {
        console.error('Update session error:', error);
        showToast('Failed to update session', 'error');
    } finally {
        hideLoading();
    }
}

// Load quizzes for edit session form
async function loadQuizzesForSessionEdit() {
    try {
        const response = await fetch('/api/admin/quizzes?limit=100', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            const select = document.getElementById('editSessionQuiz');
            select.innerHTML = '<option value="">Choose a quiz...</option>';
            
            const quizzes = Array.isArray(data.data) ? data.data : (data.quizzes || data.data?.quizzes || []);
            
            quizzes.forEach(quiz => {
                const option = document.createElement('option');
                option.value = quiz.id;
                option.textContent = `${quiz.title} (${quiz.total_questions} questions)`;
                select.appendChild(option);
            });
        } else {
            showToast('Failed to load quizzes', 'error');
        }
    } catch (error) {
        console.error('Load quizzes error:', error);
        showToast('Failed to load quizzes', 'error');
    }
}

// View session results
async function viewSessionResults(sessionId) {
    try {
        showLoading(true);
        
        // Debug: Check if modal exists, create if missing
        let modal = document.getElementById('sessionResultsModal');
        if (!modal) {
            console.log('Session results modal not found, creating it dynamically...');
            createSessionResultsModal();
            modal = document.getElementById('sessionResultsModal');
            
            if (!modal) {
                console.error('Failed to create session results modal');
                showToast('Failed to create modal. Using fallback display.', 'error');
                // Show results in a simple alert as fallback
                showResultsInAlert(sessionId);
                return;
            }
        }
        
        const response = await fetch(`/api/quiz/session/${sessionId}/results`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            displaySessionResults(data.data);
            showLoading(false); // Hide loading before opening modal
            openModal('sessionResultsModal');
        } else {
            showToast(data.message || 'Failed to load session results', 'error');
        }
    } catch (error) {
        console.error('View session results error:', error);
        showToast('Failed to load session results', 'error');
    } finally {
        showLoading(false);
    }
}

// Display session results in modal
function displaySessionResults(data) {
    const { session, results, statistics } = data;
    
    // Check if modal elements exist
    const titleElement = document.getElementById('sessionResultsTitle');
    const subtitleElement = document.getElementById('sessionResultsSubtitle');
    
    if (!titleElement || !subtitleElement) {
        console.error('Session results modal elements not found. Modal may not be properly loaded.');
        showToast('Error: Modal elements not found. Please refresh the page.', 'error');
        
        // Fallback: Show basic alert with session info
        alert(`Session Results:\n\nSession: ${session.session_name}\nQuiz: ${session.quiz_title}\nParticipants: ${statistics.total_participants}\nCompleted: ${statistics.completed_count}\nAverage Score: ${statistics.avg_percentage ? Math.round(statistics.avg_percentage) + '%' : '0%'}\n\nPlease refresh the page to see the full results modal.`);
        return;
    }
    
    // Update modal title
    titleElement.textContent = `${session.session_name} - Results`;
    subtitleElement.textContent = `${session.quiz_title} | ${new Date(session.start_time).toLocaleDateString()}`;
    
    // Update statistics with null checks
    const totalParticipantsElement = document.getElementById('totalParticipantsCount');
    const completedCountElement = document.getElementById('completedCount');
    const averageScoreElement = document.getElementById('averageScore');
    const prizeWinnersCountElement = document.getElementById('prizeWinnersCount');
    
    if (totalParticipantsElement) totalParticipantsElement.textContent = statistics.total_participants || 0;
    if (completedCountElement) completedCountElement.textContent = statistics.completed_count || 0;
    if (averageScoreElement) averageScoreElement.textContent = statistics.avg_percentage ? `${Math.round(statistics.avg_percentage)}%` : '0%';
    
    // Count and display prize winners
    const winners = results.filter(r => r.prize_position);
    if (prizeWinnersCountElement) prizeWinnersCountElement.textContent = winners.length;
    
    const prizeWinnersSection = document.getElementById('prizeWinnersSection');
    if (prizeWinnersSection) {
        if (winners.length > 0) {
            prizeWinnersSection.classList.remove('hidden');
            displayPrizeWinners(winners);
        } else {
            prizeWinnersSection.classList.add('hidden');
        }
    }
    
    // Display results table
    displayResultsTable(results);
    
    // Store session ID for other functions
    window.currentResultsSessionId = session.id;
}

// Display prize winners
function displayPrizeWinners(winners) {
    const container = document.getElementById('prizeWinnersCards');
    
    if (!container) {
        console.error('Prize winners container not found');
        return;
    }
    
    container.innerHTML = winners.map(winner => `
        <div class="bg-gradient-to-r ${
            winner.prize_position === 1 ? 'from-yellow-50 to-yellow-100 border-yellow-300' : 'from-gray-50 to-gray-100 border-gray-300'
        } border-2 rounded-lg p-4">
            <div class="flex items-center justify-between">
                <div class="flex items-center">
                    <span class="text-3xl mr-3">${winner.prize_position === 1 ? '🥇' : '🥈'}</span>
                    <div>
                        <h5 class="font-semibold text-gray-900">${winner.name}</h5>
                        <p class="text-sm text-gray-600">${winner.company || winner.designation || ''}</p>
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-xl font-bold text-gray-900">${Math.round(winner.percentage_score)}%</div>
                    <div class="text-sm text-gray-500">${formatDuration(winner.completion_time_seconds)}</div>
                </div>
            </div>
        </div>
    `).join('');
}

// Display results table
function displayResultsTable(results) {
    const tbody = document.getElementById('resultsTableBody');
    
    if (!tbody) {
        console.error('Results table body not found');
        return;
    }
    
    tbody.innerHTML = results.map((result, index) => `
        <tr class="${result.prize_position ? 'bg-yellow-50' : ''}">
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center">
                    ${result.prize_position ? 
                        `<span class="text-xl mr-2">${result.prize_position === 1 ? '🥇' : '🥈'}</span>` : 
                        `<span class="text-sm font-medium text-gray-900">#${index + 1}</span>`
                    }
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div>
                    <div class="text-sm font-medium text-gray-900">${result.name}</div>
                    <div class="text-sm text-gray-500">${result.company || result.designation || ''}</div>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-bold text-gray-900">${Math.round(result.percentage_score)}%</div>
                <div class="text-xs text-gray-500">(${result.total_score}/${result.total_questions})</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">${result.correct_answers}</div>
                <div class="text-xs text-red-500">${result.incorrect_answers} wrong</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                ${formatDuration(result.completion_time_seconds)}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="inline-flex px-2 py-1 text-xs font-medium rounded-full ${getPerformanceBadgeClass(result.performance_category)}">
                    ${result.performance_category || 'N/A'}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                ${result.prize_position ? 
                    `<span class="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
                        ${result.prize_position === 1 ? 'First Prize' : result.prize_position === 2 ? 'Second Prize' : 'Third Prize'}
                    </span>` : 
                    '<span class="text-gray-400">-</span>'
                }
            </td>
        </tr>
    `).join('');
}

// Get performance badge styling
function getPerformanceBadgeClass(category) {
    switch(category) {
        case 'Excellent': return 'bg-green-100 text-green-800';
        case 'Good': return 'bg-blue-100 text-blue-800';
        case 'Needs Improvement': return 'bg-yellow-100 text-yellow-800';
        default: return 'bg-gray-100 text-gray-800';
    }
}

// Export session results
function exportSessionResults() {
    if (!window.currentResultsSessionId) return;
    
    // TODO: Implement CSV export functionality
    showToast('Export functionality coming soon', 'info');
}

// Recalculate prizes for the session
async function recalculatePrizes() {
    if (!window.currentResultsSessionId) return;
    
    try {
        showLoading(true);
        
        const response = await fetch(`/api/quiz/session/${window.currentResultsSessionId}/calculate-prizes`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Prizes recalculated successfully', 'success');
            // Reload results
            await viewSessionResults(window.currentResultsSessionId);
        } else {
            showToast(data.message || 'Failed to recalculate prizes', 'error');
        }
    } catch (error) {
        console.error('Recalculate prizes error:', error);
        showToast('Failed to recalculate prizes', 'error');
    } finally {
        showLoading(false);
    }
}

// Create session results modal dynamically
function createSessionResultsModal() {
    const modalHTML = `
        <div id="sessionResultsModal" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full hidden z-50">
            <div class="relative top-10 mx-auto p-5 border shadow-lg rounded-xl bg-white max-w-6xl">
                <div class="mt-3">
                    <div class="flex items-center justify-between mb-6">
                        <div>
                            <h3 class="text-xl font-semibold text-gray-900" id="sessionResultsTitle">Session Results</h3>
                            <p class="text-sm text-gray-600 mt-1" id="sessionResultsSubtitle">Detailed results and statistics</p>
                        </div>
                        <button onclick="closeModal('sessionResultsModal')" class="text-gray-400 hover:text-gray-600">
                            <i class="fas fa-times text-xl"></i>
                        </button>
                    </div>
                    <div class="bg-gray-50 rounded-lg p-4 mb-6">
                        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div class="text-center">
                                <div class="text-2xl font-bold text-blue-600" id="totalParticipantsCount">0</div>
                                <div class="text-sm text-gray-600">Total Participants</div>
                            </div>
                            <div class="text-center">
                                <div class="text-2xl font-bold text-green-600" id="completedCount">0</div>
                                <div class="text-sm text-gray-600">Completed</div>
                            </div>
                            <div class="text-center">
                                <div class="text-2xl font-bold text-purple-600" id="averageScore">0%</div>
                                <div class="text-sm text-gray-600">Average Score</div>
                            </div>
                            <div class="text-center">
                                <div class="text-2xl font-bold text-yellow-600" id="prizeWinnersCount">0</div>
                                <div class="text-sm text-gray-600">Prize Winners</div>
                            </div>
                        </div>
                    </div>
                    <div id="prizeWinnersSection" class="mb-6 hidden">
                        <h4 class="text-lg font-semibold text-gray-900 mb-3">🏆 Prize Winners</h4>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4" id="prizeWinnersCards"></div>
                    </div>
                    <div class="bg-white rounded-lg border">
                        <div class="px-6 py-4 border-b border-gray-200">
                            <h4 class="text-lg font-semibold text-gray-900">Participant Results</h4>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="min-w-full divide-y divide-gray-200">
                                <thead class="bg-gray-50">
                                    <tr>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rank</th>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Participant</th>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Correct</th>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Performance</th>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prize</th>
                                    </tr>
                                </thead>
                                <tbody class="bg-white divide-y divide-gray-200" id="resultsTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                    <div class="mt-6 flex justify-between">
                        <button onclick="exportSessionResults()" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                            <i class="fas fa-download mr-2"></i>Export Results
                        </button>
                        <div class="space-x-3">
                            <button onclick="recalculatePrizes()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                                <i class="fas fa-calculator mr-2"></i>Recalculate Prizes
                            </button>
                            <button onclick="closeModal('sessionResultsModal')" class="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// Simple alert fallback for session results
async function showResultsInAlert(sessionId) {
    try {
        const response = await fetch(`/api/quiz/session/${sessionId}/results`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            const { session, results, statistics } = data.data;
            const winners = results.filter(r => r.prize_position);
            
            let alertText = `SESSION RESULTS\n\n`;
            alertText += `Session: ${session.session_name}\n`;
            alertText += `Quiz: ${session.quiz_title}\n`;
            alertText += `Date: ${new Date(session.start_time).toLocaleDateString()}\n\n`;
            alertText += `STATISTICS:\n`;
            alertText += `Total Participants: ${statistics.total_participants}\n`;
            alertText += `Completed: ${statistics.completed_count}\n`;
            alertText += `Average Score: ${statistics.avg_percentage ? Math.round(statistics.avg_percentage) + '%' : '0%'}\n\n`;
            
            if (winners.length > 0) {
                alertText += `PRIZE WINNERS:\n`;
                winners.forEach(winner => {
                    alertText += `${winner.prize_position === 1 ? '🥇' : winner.prize_position === 2 ? '🥈' : '🥉'} ${winner.name} - ${Math.round(winner.percentage_score)}% (${formatDuration(winner.completion_time_seconds)})\n`;
                });
                alertText += `\n`;
            }
            
            alertText += `TOP RESULTS:\n`;
            results.slice(0, 5).forEach((result, index) => {
                alertText += `${index + 1}. ${result.name} - ${Math.round(result.percentage_score)}% (${formatDuration(result.completion_time_seconds)})\n`;
            });
            
            alert(alertText);
        }
    } catch (error) {
        alert(`Failed to load session results: ${error.message}`);
    }
}

// Format duration helper
function formatDuration(seconds) {
    if (!seconds) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Search sessions
function searchSessions() {
    loadSessions();
}

// ===== RESULTS SECTION FUNCTIONS =====

// Load results dashboard
async function loadResultsDashboard() {
    try {
        const response = await fetch('/api/admin/results', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            updateResultsStatistics(data.data.statistics);
            updateRecentSessionsList(data.data.recentSessions);
            updateTopPerformersResults(data.data.topPerformers);
        } else {
            showToast(data.message || 'Failed to load results dashboard', 'error');
        }
    } catch (error) {
        console.error('Load results dashboard error:', error);
        showToast('Failed to load results dashboard', 'error');
    }
}

// Update results statistics
function updateResultsStatistics(stats) {
    if (!stats) return;
    
    document.getElementById('resultsSessionCount').textContent = stats.total_sessions_with_results || 0;
    document.getElementById('resultsParticipantCount').textContent = stats.total_participants || 0;
    document.getElementById('resultsAverageScore').textContent = stats.avg_score ? `${Math.round(stats.avg_score)}%` : '0%';
    document.getElementById('resultsPrizeWinners').textContent = stats.total_prize_winners || 0;
    
    // Update performance distribution
    document.getElementById('excellentCount').textContent = stats.excellent_count || 0;
    document.getElementById('goodCount').textContent = stats.good_count || 0;
    document.getElementById('needsImprovementCount').textContent = stats.needs_improvement_count || 0;
}

// Update recent sessions list
function updateRecentSessionsList(sessions) {
    const container = document.getElementById('recentSessionsList');
    
    if (!sessions || sessions.length === 0) {
        container.innerHTML = `
            <div class="text-center py-4 text-gray-500">
                <i class="fas fa-chart-bar text-2xl mb-2"></i>
                <p>No recent sessions</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = sessions.map(session => `
        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
                <div class="font-medium text-gray-900">${session.session_name}</div>
                <div class="text-sm text-gray-500">${session.quiz_title}</div>
            </div>
            <div class="text-right">
                <div class="text-sm font-medium text-gray-900">${session.participant_count} participants</div>
                <div class="text-sm text-gray-500">${Math.round(session.avg_score || 0)}% avg score</div>
            </div>
        </div>
    `).join('');
}

// Update top performers results
function updateTopPerformersResults(performers) {
    const container = document.getElementById('top-performers-results');
    
    if (!performers || performers.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <i class="fas fa-medal text-4xl mb-4"></i>
                <p>No top performers data available</p>
            </div>
        `;
        return;
    }
    
    const table = `
        <table class="min-w-full">
            <thead class="bg-gray-50">
                <tr>
                    <th class="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Participant</th>
                    <th class="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Session</th>
                    <th class="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
                    <th class="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                    <th class="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prize</th>
                </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
                ${performers.map(performer => `
                    <tr class="hover:bg-gray-50">
                        <td class="py-4 px-6">
                            <div>
                                <div class="font-medium text-gray-900">${performer.name}</div>
                                <div class="text-sm text-gray-500">${performer.company || ''}</div>
                            </div>
                        </td>
                        <td class="py-4 px-6">
                            <div>
                                <div class="font-medium text-gray-900">${performer.session_name}</div>
                                <div class="text-sm text-gray-500">${performer.quiz_title}</div>
                            </div>
                        </td>
                        <td class="py-4 px-6">
                            <span class="text-lg font-bold text-green-600">${Math.round(performer.percentage_score)}%</span>
                        </td>
                        <td class="py-4 px-6">
                            <span class="text-sm text-gray-900">${formatDuration(performer.completion_time_seconds)}</span>
                        </td>
                        <td class="py-4 px-6">
                            ${performer.prize_position ? `
                                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    performer.prize_position === 1 ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'
                                }">
                                    ${performer.prize_position === 1 ? '🥇 First' : '🥈 Second'}
                                </span>
                            ` : '<span class="text-gray-400">-</span>'}
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = table;
}

// Load session results with filtering
async function loadSessionResults() {
    const search = document.getElementById('resultsSearch')?.value || '';
    const dateFrom = document.getElementById('resultsDateFrom')?.value || '';
    const dateTo = document.getElementById('resultsDateTo')?.value || '';
    
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (dateFrom) params.append('date_from', dateFrom);
    if (dateTo) params.append('date_to', dateTo);
    
    try {
        const response = await fetch(`/api/admin/results/sessions?${params}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            updateSessionResultsTable(data.data);
        } else {
            showToast(data.message || 'Failed to load session results', 'error');
        }
    } catch (error) {
        console.error('Load session results error:', error);
        showToast('Failed to load session results', 'error');
    }
}

// Update session results table
function updateSessionResultsTable(sessions) {
    const container = document.getElementById('results-table-container');
    
    if (!sessions || sessions.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <i class="fas fa-chart-line text-4xl mb-4"></i>
                <p class="text-lg">No session results found</p>
                <p class="text-sm">Complete some quiz sessions to see results here</p>
            </div>
        `;
        return;
    }
    
    const table = `
        <table class="min-w-full">
            <thead class="bg-gray-50">
                <tr>
                    <th class="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Session</th>
                    <th class="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quiz</th>
                    <th class="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th class="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Participants</th>
                    <th class="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avg Score</th>
                    <th class="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prize Winners</th>
                    <th class="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
                ${sessions.map(session => `
                    <tr class="hover:bg-gray-50">
                        <td class="py-4 px-6">
                            <div class="font-medium text-gray-900">${session.session_name}</div>
                        </td>
                        <td class="py-4 px-6">
                            <div>
                                <div class="font-medium text-gray-900">${session.quiz_title}</div>
                                <div class="text-sm text-gray-500">${session.total_questions} questions</div>
                            </div>
                        </td>
                        <td class="py-4 px-6">
                            <span class="text-sm text-gray-900">${formatDate(session.start_time)}</span>
                        </td>
                        <td class="py-4 px-6">
                            <span class="text-lg font-bold text-blue-600">${session.participant_count}</span>
                        </td>
                        <td class="py-4 px-6">
                            <span class="text-lg font-bold text-green-600">${Math.round(session.avg_score || 0)}%</span>
                        </td>
                        <td class="py-4 px-6">
                            <span class="text-sm text-gray-900">${session.prize_winners_count || 0}</span>
                        </td>
                        <td class="py-4 px-6">
                            <div class="flex space-x-2">
                                <button onclick="viewDetailedResults(${session.id})" class="text-blue-600 hover:text-blue-900 text-sm">
                                    <i class="fas fa-eye mr-1"></i>View Details
                                </button>
                                <button onclick="exportSessionResults(${session.id})" class="text-green-600 hover:text-green-900 text-sm">
                                    <i class="fas fa-download mr-1"></i>CSV
                                </button>
                                <button onclick="exportSessionPDF(${session.id})" class="text-red-600 hover:text-red-900 text-sm">
                                    <i class="fas fa-file-pdf mr-1"></i>PDF
                                </button>
                            </div>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = table;
}

// Search results
function searchResults() {
    loadSessionResults();
}

// View detailed results (placeholder)
// ===== SESSION ANALYSIS MODAL FUNCTIONS =====

// View detailed session analysis
async function viewDetailedResults(sessionId) {
    try {
        showLoading(true);
        
        const response = await fetch(`/api/admin/results/session/${sessionId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            window.currentAnalysisSessionId = sessionId;
            displaySessionAnalysis(data.data);
            showModal('sessionAnalysisModal');
        } else {
            showToast(data.message || 'Failed to load session analysis', 'error');
        }
    } catch (error) {
        console.error('Load session analysis error:', error);
        showToast('Failed to load session analysis', 'error');
    } finally {
        showLoading(false);
    }
}

// Display session analysis data in modal
function displaySessionAnalysis(analysisData) {
    const { session, participants, questions, performance, scoreDistribution, timeAnalysis, prizeWinners } = analysisData;
    
    // Update modal title and subtitle
    document.getElementById('analysisSessionTitle').textContent = `${session.session_name} - Analysis`;
    document.getElementById('analysisSessionSubtitle').textContent = `${session.quiz_title} • ${formatDate(session.start_time)}`;
    
    // Update overview statistics
    document.getElementById('analysisParticipants').textContent = session.total_participants || 0;
    document.getElementById('analysisAvgScore').textContent = `${Math.round(session.avg_score || 0)}%`;
    document.getElementById('analysisAvgTime').textContent = formatDuration(session.avg_time_seconds || 0);
    document.getElementById('analysisQuestions').textContent = session.total_questions || 0;
    
    // Store data for tabs
    window.sessionAnalysisData = {
        participants,
        questions,
        performance,
        scoreDistribution,
        timeAnalysis,
        prizeWinners
    };
    
    // Show participants tab by default
    showAnalysisTab('participants');
}

// Show specific analysis tab
function showAnalysisTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.analysis-tab-btn').forEach(btn => {
        btn.classList.remove('border-blue-500', 'text-blue-600');
        btn.classList.add('border-transparent', 'text-gray-500');
    });
    
    document.getElementById(`${tabName}-tab`).classList.remove('border-transparent', 'text-gray-500');
    document.getElementById(`${tabName}-tab`).classList.add('border-blue-500', 'text-blue-600');
    
    // Hide all tab contents
    document.querySelectorAll('.analysis-tab-content').forEach(content => {
        content.classList.add('hidden');
    });
    
    // Show selected tab content
    document.getElementById(`${tabName}-analysis`).classList.remove('hidden');
    
    // Load tab data
    switch(tabName) {
        case 'participants':
            loadParticipantAnalysis();
            break;
        case 'questions':
            loadQuestionAnalysis();
            break;
        case 'performance':
            loadPerformanceAnalysis();
            break;
    }
}

// Cleanup charts when modal is closed
function cleanupAnalysisCharts() {
    if (window.scoreChart) {
        window.scoreChart.destroy();
        window.scoreChart = null;
    }
    if (window.performanceChart) {
        window.performanceChart.destroy();
        window.performanceChart = null;
    }
    if (window.timeChart) {
        window.timeChart.destroy();
        window.timeChart = null;
    }
    if (window.difficultyChart) {
        window.difficultyChart.destroy();
        window.difficultyChart = null;
    }
}

// Load participant analysis data
function loadParticipantAnalysis() {
    const { participants } = window.sessionAnalysisData;
    const tableBody = document.getElementById('participantResultsTable');
    
    if (!participants || participants.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-8 text-gray-500">
                    <i class="fas fa-users text-2xl mb-2"></i>
                    <p>No participant results found</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tableBody.innerHTML = participants.map((participant, index) => `
        <tr class="hover:bg-gray-50">
            <td class="px-6 py-4">
                <div class="flex items-center">
                    ${participant.prize_position ? `
                        <span class="mr-2 text-lg">
                            ${participant.prize_position === 1 ? '🥇' : '🥈'}
                        </span>
                    ` : ''}
                    <span class="text-lg font-bold text-gray-900">${participant.rank_position || index + 1}</span>
                </div>
            </td>
            <td class="px-6 py-4">
                <div>
                    <div class="font-medium text-gray-900">${participant.name}</div>
                    <div class="text-sm text-gray-500">${participant.email}</div>
                    <div class="text-sm text-gray-500">${participant.company || ''}</div>
                </div>
            </td>
            <td class="px-6 py-4">
                <div class="flex items-center">
                    <span class="text-lg font-bold text-green-600">${Math.round(participant.percentage_score)}%</span>
                    <div class="ml-2 text-sm text-gray-500">
                        ${participant.correct_answers}/${participant.total_questions}
                    </div>
                </div>
            </td>
            <td class="px-6 py-4">
                <span class="text-sm text-gray-900">${formatDuration(participant.completion_time_seconds)}</span>
            </td>
            <td class="px-6 py-4">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPerformanceBadgeClass(participant.performance_category)}">
                    ${participant.performance_category || 'N/A'}
                </span>
            </td>
            <td class="px-6 py-4">
                <div class="flex flex-col space-y-1">
                    <button onclick="viewParticipantProfile(${participant.id})" class="text-blue-600 hover:text-blue-900 text-sm">
                        <i class="fas fa-user mr-1"></i>View Profile
                    </button>
                    <div class="text-xs text-gray-500">
                        <div>Incorrect: ${participant.incorrect_answers}</div>
                        <div>Unanswered: ${participant.unanswered}</div>
                    </div>
                </div>
            </td>
        </tr>
    `).join('');
    
    // Add search and filter functionality
    setupParticipantFilters();
}

// Load question analysis data
function loadQuestionAnalysis() {
    const { questions } = window.sessionAnalysisData;
    const tableBody = document.getElementById('questionAnalysisTable');
    
    if (!questions || questions.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-8 text-gray-500">
                    <i class="fas fa-question-circle text-2xl mb-2"></i>
                    <p>No question analysis data found</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tableBody.innerHTML = questions.map(question => `
        <tr class="hover:bg-gray-50">
            <td class="px-6 py-4">
                <div class="max-w-md">
                    <div class="font-medium text-gray-900 truncate">${question.question_text}</div>
                    <div class="text-sm text-gray-500">Question ${question.question_order}</div>
                </div>
            </td>
            <td class="px-6 py-4">
                <div class="flex items-center">
                    <div class="w-16 bg-gray-200 rounded-full h-2 mr-2">
                        <div class="bg-green-600 h-2 rounded-full" style="width: ${question.success_rate}%"></div>
                    </div>
                    <span class="text-sm font-medium text-gray-900">${Math.round(question.success_rate)}%</span>
                </div>
            </td>
            <td class="px-6 py-4">
                <span class="text-lg font-bold text-green-600">${question.correct_count}</span>
            </td>
            <td class="px-6 py-4">
                <span class="text-lg font-bold text-red-600">${question.incorrect_count}</span>
            </td>
            <td class="px-6 py-4">
                <span class="text-lg font-bold text-gray-600">${question.unanswered_count}</span>
            </td>
            <td class="px-6 py-4">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getDifficultyBadgeClass(question.difficulty)}">
                    ${question.difficulty}
                </span>
            </td>
        </tr>
    `).join('');
}

// Load performance analysis data
function loadPerformanceAnalysis() {
    const { scoreDistribution, performance, timeAnalysis, prizeWinners, questions } = window.sessionAnalysisData;
    
    // Score Distribution Chart
    displayScoreDistributionChart(scoreDistribution);
    
    // Performance Categories
    displayPerformanceDistributionChart(performance);
    
    // Time Analysis
    displayTimeAnalysisChart(timeAnalysis);
    
    // Question Difficulty Chart
    displayQuestionDifficultyChart(questions);
    
    // Prize Winners
    displayPrizeWinners(prizeWinners);
}

// Display score distribution chart
function displayScoreDistributionChart(scoreDistribution) {
    const ctx = document.getElementById('scoreDistributionChart');
    
    // Destroy existing chart if it exists
    if (window.scoreChart) {
        window.scoreChart.destroy();
    }
    
    if (!scoreDistribution || scoreDistribution.length === 0) {
        ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
        return;
    }
    
    window.scoreChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: scoreDistribution.map(item => item.range),
            datasets: [{
                label: 'Participants',
                data: scoreDistribution.map(item => item.count),
                backgroundColor: 'rgba(59, 130, 246, 0.8)',
                borderColor: 'rgba(59, 130, 246, 1)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const percentage = scoreDistribution[context.dataIndex].percentage;
                            return `${context.formattedValue} participants (${Math.round(percentage)}%)`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

// Display performance distribution chart
function displayPerformanceDistributionChart(performance) {
    const ctx = document.getElementById('performanceDistributionChart');
    
    // Destroy existing chart if it exists
    if (window.performanceChart) {
        window.performanceChart.destroy();
    }
    
    if (!performance) {
        ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
        return;
    }
    
    const categories = [
        { name: 'Excellent', count: performance.excellent || 0, color: 'rgba(34, 197, 94, 0.8)' },
        { name: 'Good', count: performance.good || 0, color: 'rgba(59, 130, 246, 0.8)' },
        { name: 'Needs Improvement', count: performance.needs_improvement || 0, color: 'rgba(245, 158, 11, 0.8)' }
    ];
    
    const total = categories.reduce((sum, cat) => sum + cat.count, 0);
    
    window.performanceChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: categories.map(cat => cat.name),
            datasets: [{
                data: categories.map(cat => cat.count),
                backgroundColor: categories.map(cat => cat.color),
                borderColor: categories.map(cat => cat.color.replace('0.8', '1')),
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        padding: 20
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const percentage = total > 0 ? Math.round((context.parsed / total) * 100) : 0;
                            return `${context.label}: ${context.formattedValue} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// Display time analysis chart
function displayTimeAnalysisChart(timeAnalysis) {
    const ctx = document.getElementById('timeAnalysisChart');
    
    // Destroy existing chart if it exists
    if (window.timeChart) {
        window.timeChart.destroy();
    }
    
    if (!timeAnalysis) {
        ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
        return;
    }
    
    const stats = [
        { label: 'Fastest', value: timeAnalysis.min_time, color: 'rgba(34, 197, 94, 0.8)' },
        { label: 'Average', value: timeAnalysis.avg_time, color: 'rgba(59, 130, 246, 0.8)' },
        { label: 'Median', value: timeAnalysis.median_time, color: 'rgba(168, 85, 247, 0.8)' },
        { label: 'Slowest', value: timeAnalysis.max_time, color: 'rgba(239, 68, 68, 0.8)' }
    ];
    
    window.timeChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: stats.map(stat => stat.label),
            datasets: [{
                label: 'Time (seconds)',
                data: stats.map(stat => stat.value),
                backgroundColor: stats.map(stat => stat.color),
                borderColor: stats.map(stat => stat.color.replace('0.8', '1')),
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.label}: ${formatDuration(context.parsed.y)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return formatDuration(value);
                        }
                    }
                }
            }
        }
    });
}

// Display question difficulty chart
function displayQuestionDifficultyChart(questions) {
    const ctx = document.getElementById('questionDifficultyChart');
    
    // Destroy existing chart if it exists
    if (window.difficultyChart) {
        window.difficultyChart.destroy();
    }
    
    if (!questions || questions.length === 0) {
        ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
        return;
    }
    
    // Group questions by difficulty
    const difficultyGroups = {
        'Easy': questions.filter(q => q.difficulty === 'Easy'),
        'Medium': questions.filter(q => q.difficulty === 'Medium'),
        'Hard': questions.filter(q => q.difficulty === 'Hard')
    };
    
    const avgSuccessRates = Object.keys(difficultyGroups).map(difficulty => {
        const group = difficultyGroups[difficulty];
        if (group.length === 0) return 0;
        return group.reduce((sum, q) => sum + q.success_rate, 0) / group.length;
    });
    
    window.difficultyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Object.keys(difficultyGroups),
            datasets: [{
                label: 'Average Success Rate (%)',
                data: avgSuccessRates,
                borderColor: 'rgba(59, 130, 246, 1)',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: 'rgba(59, 130, 246, 1)',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const questionCount = difficultyGroups[context.label].length;
                            return [
                                `Success Rate: ${Math.round(context.parsed.y)}%`,
                                `Questions: ${questionCount}`
                            ];
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                }
            }
        }
    });
}

// Display prize winners
function displayPrizeWinners(prizeWinners) {
    const container = document.getElementById('prizeWinnersDisplay');
    
    if (!prizeWinners || prizeWinners.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center">No prize winners</p>';
        return;
    }
    
    container.innerHTML = prizeWinners.map(winner => `
        <div class="flex items-center justify-between p-3 bg-gradient-to-r ${
            winner.prize_position === 1 ? 'from-yellow-50 to-yellow-100 border-yellow-200' : 'from-gray-50 to-gray-100 border-gray-200'
        } rounded-lg border">
            <div class="flex items-center">
                <span class="text-2xl mr-3">${winner.prize_position === 1 ? '🥇' : '🥈'}</span>
                <div>
                    <div class="font-medium text-gray-900">${winner.name}</div>
                    <div class="text-sm text-gray-500">${winner.company || ''}</div>
                </div>
            </div>
            <div class="text-right">
                <div class="text-lg font-bold text-gray-900">${Math.round(winner.percentage_score)}%</div>
                <div class="text-sm text-gray-500">${formatDuration(winner.completion_time_seconds)}</div>
            </div>
        </div>
    `).join('');
}

// Setup participant search and filter functionality
function setupParticipantFilters() {
    const searchInput = document.getElementById('participantSearch');
    const performanceFilter = document.getElementById('performanceFilter');
    
    if (searchInput) {
        searchInput.addEventListener('input', filterParticipants);
    }
    
    if (performanceFilter) {
        performanceFilter.addEventListener('change', filterParticipants);
    }
}

// Filter participants based on search and performance
function filterParticipants() {
    const searchTerm = document.getElementById('participantSearch').value.toLowerCase();
    const performanceFilter = document.getElementById('performanceFilter').value;
    const tableRows = document.querySelectorAll('#participantResultsTable tr');
    
    tableRows.forEach(row => {
        const name = row.querySelector('td:nth-child(2) .font-medium')?.textContent.toLowerCase() || '';
        const email = row.querySelector('td:nth-child(2) .text-gray-500')?.textContent.toLowerCase() || '';
        const performance = row.querySelector('td:nth-child(5) .inline-flex')?.textContent.trim() || '';
        
        const matchesSearch = name.includes(searchTerm) || email.includes(searchTerm);
        const matchesPerformance = !performanceFilter || performance === performanceFilter;
        
        if (matchesSearch && matchesPerformance) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

// Export session results to CSV
async function exportSessionResults(sessionId) {
    try {
        showLoading(true);
        
        const response = await fetch(`/api/admin/results/export/${sessionId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `session_${sessionId}_results.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            showToast('Results exported successfully', 'success');
        } else {
            const data = await response.json();
            showToast(data.message || 'Failed to export results', 'error');
        }
    } catch (error) {
        console.error('Export session results error:', error);
        showToast('Failed to export results', 'error');
    } finally {
        showLoading(false);
    }
}

// Export session results to PDF
async function exportSessionPDF(sessionId) {
    try {
        showLoading(true);
        
        if (!window.jsPDF) {
            showToast('PDF library not loaded', 'error');
            return;
        }
        
        const { jsPDF } = window.jsPDF;
        
        // Get session analysis data
        const response = await fetch(`/api/admin/results/session/${sessionId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        
        if (!data.success) {
            showToast(data.message || 'Failed to load session data', 'error');
            return;
        }
        
        const { session, participants, questions, performance, scoreDistribution, timeAnalysis, prizeWinners } = data.data;
        
        // Create PDF
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.width;
        const margin = 20;
        let yPosition = margin;
        
        // Title
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('Session Analysis Report', margin, yPosition);
        yPosition += 15;
        
        // Session Info
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(`${session.session_name}`, margin, yPosition);
        yPosition += 10;
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Quiz: ${session.quiz_title}`, margin, yPosition);
        yPosition += 7;
        doc.text(`Date: ${formatDate(session.start_time)}`, margin, yPosition);
        yPosition += 7;
        doc.text(`Total Questions: ${session.total_questions}`, margin, yPosition);
        yPosition += 15;
        
        // Overview Statistics
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Overview Statistics', margin, yPosition);
        yPosition += 10;
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Total Participants: ${session.total_participants}`, margin, yPosition);
        yPosition += 7;
        doc.text(`Average Score: ${Math.round(session.avg_score || 0)}%`, margin, yPosition);
        yPosition += 7;
        doc.text(`Average Time: ${formatDuration(session.avg_time_seconds || 0)}`, margin, yPosition);
        yPosition += 15;
        
        // Performance Distribution
        if (performance) {
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('Performance Distribution', margin, yPosition);
            yPosition += 10;
            
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text(`Excellent: ${performance.excellent || 0}`, margin, yPosition);
            yPosition += 7;
            doc.text(`Good: ${performance.good || 0}`, margin, yPosition);
            yPosition += 7;
            doc.text(`Needs Improvement: ${performance.needs_improvement || 0}`, margin, yPosition);
            yPosition += 15;
        }
        
        // Prize Winners
        if (prizeWinners && prizeWinners.length > 0) {
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('Prize Winners', margin, yPosition);
            yPosition += 10;
            
            doc.setFontSize(10);
            prizeWinners.forEach(winner => {
                doc.setFont('helvetica', 'bold');
                doc.text(`${winner.prize_position === 1 ? 'First Prize:' : winner.prize_position === 2 ? 'Second Prize:' : 'Third Prize:'} ${winner.name}`, margin, yPosition);
                yPosition += 7;
                doc.setFont('helvetica', 'normal');
                doc.text(`Score: ${Math.round(winner.percentage_score)}% | Time: ${formatDuration(winner.completion_time_seconds)}`, margin + 10, yPosition);
                yPosition += 10;
            });
            yPosition += 5;
        }
        
        // Check if we need a new page for participant results
        if (yPosition > 200) {
            doc.addPage();
            yPosition = margin;
        }
        
        // Participant Results Table
        if (participants && participants.length > 0) {
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('Participant Results', margin, yPosition);
            yPosition += 10;
            
            // Prepare table data
            const tableData = participants.map((participant, index) => [
                participant.rank_position || index + 1,
                participant.name,
                participant.company || '',
                `${Math.round(participant.percentage_score)}%`,
                `${participant.correct_answers}/${participant.total_questions}`,
                formatDuration(participant.completion_time_seconds),
                participant.performance_category || 'N/A',
                participant.prize_position ? (participant.prize_position === 1 ? 'First' : 'Second') : '-'
            ]);
            
            doc.autoTable({
                startY: yPosition,
                head: [['Rank', 'Name', 'Company', 'Score', 'Correct', 'Time', 'Performance', 'Prize']],
                body: tableData,
                styles: { fontSize: 8 },
                headStyles: { fillColor: [59, 130, 246] },
                margin: { left: margin, right: margin },
                columnStyles: {
                    0: { halign: 'center', cellWidth: 15 },
                    3: { halign: 'center', cellWidth: 20 },
                    4: { halign: 'center', cellWidth: 20 },
                    5: { halign: 'center', cellWidth: 20 },
                    7: { halign: 'center', cellWidth: 20 }
                }
            });
        }
        
        // Save the PDF
        const sessionName = session.session_name.replace(/[^a-z0-9]/gi, '_');
        const filename = `${sessionName}_analysis_${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(filename);
        
        showToast('PDF exported successfully', 'success');
        
    } catch (error) {
        console.error('Export PDF error:', error);
        showToast('Failed to export PDF', 'error');
    } finally {
        showLoading(false);
    }
}

// ===== PARTICIPANT PROFILE FUNCTIONS =====

// View participant profile
async function viewParticipantProfile(participantId) {
    try {
        showLoading(true);
        
        const response = await fetch(`/api/admin/participants/${participantId}/history`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            displayParticipantProfile(data.data);
            showModal('participantProfileModal');
        } else {
            showToast(data.message || 'Failed to load participant profile', 'error');
        }
    } catch (error) {
        console.error('Load participant profile error:', error);
        showToast('Failed to load participant profile', 'error');
    } finally {
        showLoading(false);
    }
}

// Display participant profile data
function displayParticipantProfile(profileData) {
    const { participant, sessionHistory, statistics } = profileData;
    
    // Update participant info
    document.getElementById('profileParticipantName').textContent = participant.name;
    document.getElementById('profileParticipantDetails').textContent = 
        `${participant.email} • ${participant.designation || 'N/A'} • ${participant.company || 'N/A'}`;
    
    // Update statistics
    document.getElementById('profileTotalSessions').textContent = statistics.total_sessions;
    document.getElementById('profileAvgScore').textContent = `${statistics.avg_score}%`;
    document.getElementById('profilePrizeCount').textContent = statistics.prize_count;
    document.getElementById('profileBestRank').textContent = statistics.best_rank || '-';
    
    // Update session history table
    const tableBody = document.getElementById('profileSessionHistoryTable');
    
    if (!sessionHistory || sessionHistory.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-8 text-gray-500">
                    <i class="fas fa-history text-2xl mb-2"></i>
                    <p>No session history found</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tableBody.innerHTML = sessionHistory.map(session => `
        <tr class="hover:bg-gray-50">
            <td class="px-6 py-4">
                <div class="font-medium text-gray-900">${session.session_name}</div>
            </td>
            <td class="px-6 py-4">
                <div>
                    <div class="font-medium text-gray-900">${session.quiz_title}</div>
                    <div class="text-sm text-gray-500">${session.total_questions} questions</div>
                </div>
            </td>
            <td class="px-6 py-4">
                <span class="text-sm text-gray-900">${formatDate(session.start_time)}</span>
            </td>
            <td class="px-6 py-4">
                ${session.percentage_score !== null ? `
                    <div class="flex items-center">
                        <span class="text-lg font-bold text-green-600">${Math.round(session.percentage_score)}%</span>
                        <div class="ml-2 text-sm text-gray-500">
                            ${session.correct_answers}/${session.total_questions}
                        </div>
                    </div>
                ` : '<span class="text-gray-400">Not completed</span>'}
            </td>
            <td class="px-6 py-4">
                ${session.rank_position ? `
                    <div class="flex items-center">
                        ${session.prize_position ? `
                            <span class="mr-2 text-lg">
                                ${session.prize_position === 1 ? '🥇' : '🥈'}
                            </span>
                        ` : ''}
                        <span class="text-lg font-bold text-gray-900">${session.rank_position}</span>
                    </div>
                ` : '<span class="text-gray-400">-</span>'}
            </td>
            <td class="px-6 py-4">
                ${session.completion_time_seconds ? formatDuration(session.completion_time_seconds) : '-'}
            </td>
            <td class="px-6 py-4">
                ${session.performance_category ? `
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPerformanceBadgeClass(session.performance_category)}">
                        ${session.performance_category}
                    </span>
                ` : '<span class="text-gray-400">-</span>'}
            </td>
            <td class="px-6 py-4">
                ${session.total_score !== null ? `
                    <button onclick="viewQuestionReview(${participant.id}, ${session.session_id})" class="text-blue-600 hover:text-blue-900 text-sm">
                        <i class="fas fa-list mr-1"></i>Review Questions
                    </button>
                ` : '<span class="text-gray-400">N/A</span>'}
            </td>
        </tr>
    `).join('');
}

// View question-by-question review
async function viewQuestionReview(participantId, sessionId) {
    try {
        showLoading(true);
        
        const response = await fetch(`/api/admin/participants/${participantId}/session/${sessionId}/questions`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            displayQuestionReview(data.data);
            showModal('questionReviewModal');
        } else {
            showToast(data.message || 'Failed to load question review', 'error');
        }
    } catch (error) {
        console.error('Load question review error:', error);
        showToast('Failed to load question review', 'error');
    } finally {
        showLoading(false);
    }
}

// Display question review data
function displayQuestionReview(reviewData) {
    const { session, questions, statistics } = reviewData;
    
    // Update session info
    document.getElementById('reviewSessionTitle').textContent = 
        `${session.participant_name} - Question Review`;
    document.getElementById('reviewSessionSubtitle').textContent = 
        `${session.session_name} • ${session.quiz_title}`;
    
    // Update statistics
    document.getElementById('reviewTotalQuestions').textContent = statistics.total_questions;
    document.getElementById('reviewCorrect').textContent = statistics.correct;
    document.getElementById('reviewIncorrect').textContent = statistics.incorrect;
    document.getElementById('reviewUnanswered').textContent = statistics.unanswered;
    document.getElementById('reviewAvgTime').textContent = `${statistics.avg_time_per_question}s`;
    
    // Update questions list
    const container = document.getElementById('questionReviewList');
    
    if (!questions || questions.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <i class="fas fa-question-circle text-2xl mb-2"></i>
                <p>No questions found</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = questions.map((question, index) => {
        const options = [
            { key: 'a', text: question.option_a },
            { key: 'b', text: question.option_b },
            { key: 'c', text: question.option_c },
            { key: 'd', text: question.option_d }
        ];
        
        const correctOption = options.find(opt => opt.key === question.correct_answer);
        const selectedOption = options.find(opt => opt.key === question.selected_answer);
        
        let statusIcon = '';
        let statusColor = '';
        
        if (question.selected_answer === null) {
            statusIcon = 'fas fa-minus-circle';
            statusColor = 'text-gray-500';
        } else if (question.is_correct) {
            statusIcon = 'fas fa-check-circle';
            statusColor = 'text-green-600';
        } else {
            statusIcon = 'fas fa-times-circle';
            statusColor = 'text-red-600';
        }
        
        return `
            <div class="border-b border-gray-200 p-4">
                <div class="flex items-start space-x-4">
                    <div class="flex-shrink-0">
                        <div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                            <span class="text-sm font-medium text-blue-600">${question.question_order}</span>
                        </div>
                    </div>
                    <div class="flex-1">
                        <div class="flex items-start justify-between">
                            <div class="flex-1">
                                <h5 class="font-medium text-gray-900 mb-3">${question.question_text}</h5>
                                
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                                    ${options.map(option => `
                                        <div class="p-2 rounded border ${
                                            option.key === question.correct_answer 
                                                ? 'bg-green-50 border-green-200' 
                                                : option.key === question.selected_answer 
                                                    ? (question.is_correct ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200')
                                                    : 'bg-gray-50 border-gray-200'
                                        }">
                                            <div class="flex items-center">
                                                <span class="font-medium mr-2">${option.key.toUpperCase()}.</span>
                                                <span class="text-sm">${option.text}</span>
                                                ${option.key === question.correct_answer ? '<i class="fas fa-check text-green-600 ml-auto"></i>' : ''}
                                                ${option.key === question.selected_answer && !question.is_correct ? '<i class="fas fa-times text-red-600 ml-auto"></i>' : ''}
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                                
                                <div class="flex items-center justify-between text-sm text-gray-600">
                                    <div class="flex items-center space-x-4">
                                        <span class="flex items-center">
                                            <i class="${statusIcon} ${statusColor} mr-1"></i>
                                            ${question.selected_answer === null ? 'Unanswered' : 
                                              question.is_correct ? 'Correct' : 'Incorrect'}
                                        </span>
                                        ${question.time_taken_seconds ? `
                                            <span class="flex items-center">
                                                <i class="fas fa-clock text-gray-400 mr-1"></i>
                                                ${question.time_taken_seconds}s
                                            </span>
                                        ` : ''}
                                    </div>
                                    <div class="text-xs text-gray-500">
                                        Success Rate: ${Math.round(question.success_rate || 0)}% 
                                        (${question.correct_count}/${question.total_attempts})
                                    </div>
                                </div>
                                
                                ${!question.is_correct && question.selected_answer ? `
                                    <div class="mt-2 p-2 bg-blue-50 border border-blue-200 rounded">
                                        <div class="text-sm">
                                            <span class="font-medium text-blue-800">Correct Answer:</span>
                                            <span class="text-blue-700">${correctOption ? `${correctOption.key.toUpperCase()}. ${correctOption.text}` : 'Not available'}</span>
                                        </div>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Helper function to get performance badge class
function getPerformanceBadgeClass(performance) {
    switch(performance) {
        case 'Excellent':
            return 'bg-green-100 text-green-800';
        case 'Good':
            return 'bg-blue-100 text-blue-800';
        case 'Needs Improvement':
            return 'bg-yellow-100 text-yellow-800';
        default:
            return 'bg-gray-100 text-gray-800';
    }
}

// Helper function to get difficulty badge class
function getDifficultyBadgeClass(difficulty) {
    switch(difficulty) {
        case 'Easy':
            return 'bg-green-100 text-green-800';
        case 'Medium':
            return 'bg-yellow-100 text-yellow-800';
        case 'Hard':
            return 'bg-red-100 text-red-800';
        default:
            return 'bg-gray-100 text-gray-800';
    }
}

// Format duration helper
function formatDuration(seconds) {
    if (!seconds) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Format date helper
function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Filter sessions by status
function filterSessions() {
    loadSessions();
}

// Load available quizzes for session creation
async function loadQuizzesForSession() {
    console.log('Loading quizzes for session creation...');
    
    try {
        const response = await fetch('/api/admin/quizzes?limit=100', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        console.log('Quizzes response:', data);
        console.log('data.data type:', typeof data.data);
        console.log('data.data is array:', Array.isArray(data.data));
        
        if (data.success) {
            const select = document.getElementById('sessionQuiz');
            select.innerHTML = '<option value="">Choose a quiz...</option>';
            
            console.log('Processing quizzes:', data.data);
            
            // Check if data.data is an array, if not, look for the correct property
            const quizzes = Array.isArray(data.data) ? data.data : (data.quizzes || data.data?.quizzes || []);
            console.log('Using quizzes array:', quizzes);
            
            quizzes.forEach(quiz => {
                console.log('Quiz:', quiz.title, 'Active:', quiz.is_active, 'Questions:', quiz.total_questions);
                
                // Show all active quizzes regardless of question count for debugging
                if (quiz.is_active) {
                    const option = document.createElement('option');
                    option.value = quiz.id;
                    option.textContent = `${quiz.title} (${quiz.total_questions || 0} questions)`;
                    select.appendChild(option);
                }
            });
            
            console.log('Quiz dropdown populated with', select.children.length - 1, 'options');
        } else {
            console.error('Failed to load quizzes:', data.message);
            showToast(data.message || 'Failed to load quizzes', 'error');
        }
    } catch (error) {
        console.error('Load quizzes for session error:', error);
        showToast('Failed to load quizzes', 'error');
    }
}


// Helper functions
function getStatusColor(status) {
    const colors = {
        'scheduled': 'bg-gray-100 text-gray-800',
        'instruction': 'bg-yellow-100 text-yellow-800',
        'active': 'bg-green-100 text-green-800',
        'completed': 'bg-blue-100 text-blue-800',
        'cancelled': 'bg-red-100 text-red-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
}

function getRankGradient(index) {
    const gradients = [
        'from-yellow-400 to-yellow-600',
        'from-gray-400 to-gray-600',
        'from-orange-400 to-orange-600',
        'from-blue-400 to-blue-600',
        'from-purple-400 to-purple-600'
    ];
    return gradients[index] || 'from-gray-400 to-gray-600';
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function updatePagination(pagination) {
    const container = document.getElementById('participants-pagination');
    
    if (pagination.totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    let paginationHtml = `
        <div class="flex items-center justify-between">
            <div class="flex-1 flex justify-between sm:hidden">
                <button ${pagination.page === 1 ? 'disabled' : ''} onclick="loadParticipants(${pagination.page - 1})" 
                        class="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">
                    Previous
                </button>
                <button ${pagination.page === pagination.totalPages ? 'disabled' : ''} onclick="loadParticipants(${pagination.page + 1})" 
                        class="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">
                    Next
                </button>
            </div>
            <div class="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                    <p class="text-sm text-gray-700">
                        Showing <span class="font-medium">${(pagination.page - 1) * pagination.limit + 1}</span> to 
                        <span class="font-medium">${Math.min(pagination.page * pagination.limit, pagination.total)}</span> of 
                        <span class="font-medium">${pagination.total}</span> results
                    </p>
                </div>
                <div>
                    <nav class="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
    `;
    
    // Previous button
    paginationHtml += `
        <button ${pagination.page === 1 ? 'disabled' : ''} onclick="loadParticipants(${pagination.page - 1})"
                class="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50">
            <i class="fas fa-chevron-left"></i>
        </button>
    `;
    
    // Page numbers
    for (let i = 1; i <= pagination.totalPages; i++) {
        if (i === pagination.page) {
            paginationHtml += `
                <button class="relative inline-flex items-center px-4 py-2 border border-blue-500 bg-blue-50 text-sm font-medium text-blue-600">
                    ${i}
                </button>
            `;
        } else if (i === 1 || i === pagination.totalPages || (i >= pagination.page - 2 && i <= pagination.page + 2)) {
            paginationHtml += `
                <button onclick="loadParticipants(${i})" 
                        class="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50">
                    ${i}
                </button>
            `;
        } else if (i === pagination.page - 3 || i === pagination.page + 3) {
            paginationHtml += `
                <span class="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                    ...
                </span>
            `;
        }
    }
    
    // Next button
    paginationHtml += `
        <button ${pagination.page === pagination.totalPages ? 'disabled' : ''} onclick="loadParticipants(${pagination.page + 1})"
                class="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50">
            <i class="fas fa-chevron-right"></i>
        </button>
    `;
    
    paginationHtml += `
                    </nav>
                </div>
            </div>
        </div>
    `;
    
    container.innerHTML = paginationHtml;
}