const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { authenticateAdmin, authorizeAdmin, logAdminAction } = require('../middleware/auth');
const participantService = require('../services/participantService');
const notificationService = require('../services/notificationService');
const db = require('../config/database');
const { redisHelper } = require('../config/redis');
const { createTimezoneDate, formatInTimezone, getTimezoneInfo } = require('../utils/timezone');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.csv', '.xlsx', '.xls'];
        const fileExt = path.extname(file.originalname).toLowerCase();
        
        if (allowedTypes.includes(fileExt)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only CSV and Excel files are allowed.'));
        }
    }
});

// Apply authentication to all admin routes
router.use(authenticateAdmin);

// Dashboard - Get overview statistics
router.get('/dashboard', authorizeAdmin(), async (req, res) => {
    try {
        // Get dashboard statistics
        const stats = await db.query(`
            SELECT 
                (SELECT COUNT(*) FROM participants) as total_participants,
                (SELECT COUNT(*) FROM quizzes) as total_quizzes,
                (SELECT COUNT(*) FROM quiz_sessions WHERE status = 'active') as active_sessions,
                (SELECT COUNT(*) FROM quiz_sessions WHERE status = 'completed') as completed_sessions,
                (SELECT COUNT(*) FROM admin_users WHERE is_active = true) as active_admins,
                (SELECT COUNT(*) FROM results) as total_results
        `);
        
        // Get recent sessions
        const recentSessions = await db.query(`
            SELECT qs.*, q.title as quiz_title, q.description
            FROM quiz_sessions qs
            JOIN quizzes q ON qs.quiz_id = q.id
            ORDER BY qs.created_at DESC
            LIMIT 5
        `);
        
        // Get top performers (last 30 days)
        const topPerformers = await db.query(`
            SELECT p.name, p.email, r.total_score, r.completion_time_seconds, q.title as quiz_title
            FROM results r
            JOIN participants p ON r.participant_id = p.id
            JOIN quiz_sessions qs ON r.session_id = qs.id
            JOIN quizzes q ON qs.quiz_id = q.id
            WHERE r.created_at >= CURRENT_DATE - INTERVAL '30 days'
            ORDER BY r.total_score DESC, r.completion_time_seconds ASC
            LIMIT 10
        `);
        
        res.json({
            success: true,
            data: {
                statistics: stats.rows[0],
                recentSessions: recentSessions.rows,
                topPerformers: topPerformers.rows
            }
        });
        
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load dashboard data'
        });
    }
});

// Participant Management - Upload participants
router.post('/participants/upload', authorizeAdmin(), upload.single('participantFile'), logAdminAction('upload_participants'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }
        
        const { sessionId } = req.body;
        const filePath = req.file.path;
        const fileExt = path.extname(req.file.originalname).toLowerCase();
        
        let participantsData = [];
        
        // Parse file based on type
        if (fileExt === '.csv') {
            // Parse CSV
            const csvData = fs.readFileSync(filePath, 'utf8');
            participantsData = await participantService.parseParticipantData(csvData, 'csv');
        } else if (fileExt === '.xlsx' || fileExt === '.xls') {
            // Parse Excel
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            participantsData = await participantService.parseParticipantData(jsonData, 'excel');
        }
        
        // Bulk upload participants
        const results = await participantService.bulkUploadParticipants(participantsData, sessionId);
        
        // Clean up uploaded file
        fs.unlinkSync(filePath);
        
        res.json({
            success: true,
            message: `Processed ${participantsData.length} participants`,
            data: {
                totalProcessed: participantsData.length,
                successful: results.success.length,
                failed: results.errors.length,
                results: results
            }
        });
        
    } catch (error) {
        console.error('Upload participants error:', error);
        
        // Clean up file on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({
            success: false,
            message: 'Failed to upload participants',
            error: error.message
        });
    }
});

// Get credentials for manual distribution
router.post('/participants/get-credentials', authorizeAdmin(), logAdminAction('get_credentials'), async (req, res) => {
    try {
        const { participantIds } = req.body;
        
        if (!participantIds || !Array.isArray(participantIds)) {
            return res.status(400).json({
                success: false,
                message: 'Participant IDs array is required'
            });
        }
        
        const credentials = await participantService.getCredentialsForDisplay(participantIds);
        
        res.json({
            success: true,
            message: 'Credentials retrieved successfully',
            data: credentials
        });
        
    } catch (error) {
        console.error('Get credentials error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get credentials'
        });
    }
});

// Reset participant password
router.post('/participants/reset-password', authorizeAdmin(), logAdminAction('reset_password'), async (req, res) => {
    try {
        const { participantId } = req.body;
        
        if (!participantId) {
            return res.status(400).json({
                success: false,
                message: 'Participant ID is required'
            });
        }
        
        const result = await participantService.resetParticipantPassword(participantId);
        
        res.json({
            success: true,
            message: 'Password reset successfully',
            data: {
                participantId: participantId,
                newPassword: result.newPassword
            }
        });
        
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to reset password'
        });
    }
});

// Get participant details
router.get('/participants/:id', authorizeAdmin(), async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await db.query(`
            SELECT p.*, uc.is_active
            FROM participants p
            LEFT JOIN user_credentials uc ON p.id = uc.participant_id
            WHERE p.id = $1
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Participant not found'
            });
        }
        
        res.json({
            success: true,
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Get participant error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get participant'
        });
    }
});

// Update participant information
router.put('/participants/:id', authorizeAdmin(), logAdminAction('edit_participant'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, company, designation, mobile } = req.body;
        
        if (!name || !email) {
            return res.status(400).json({
                success: false,
                message: 'Name and email are required'
            });
        }
        
        // Check if email is already used by another participant
        const existingResult = await db.query(
            'SELECT id FROM participants WHERE email = $1 AND id != $2',
            [email, id]
        );
        
        if (existingResult.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Email is already used by another participant'
            });
        }
        
        // Clean mobile number if provided
        let cleanedMobile = mobile;
        if (mobile) {
            try {
                cleanedMobile = participantService.cleanMobileNumber(mobile);
            } catch (error) {
                return res.status(400).json({
                    success: false,
                    message: error.message
                });
            }
        }
        
        // Update participant
        const result = await db.query(`
            UPDATE participants 
            SET name = $1, email = $2, company = $3, designation = $4, mobile = $5, updated_at = CURRENT_TIMESTAMP
            WHERE id = $6
            RETURNING *
        `, [name, email, company, designation, cleanedMobile, id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Participant not found'
            });
        }
        
        // Update username if email changed
        await db.query(
            'UPDATE user_credentials SET username = $1 WHERE participant_id = $2',
            [email.toLowerCase().trim(), id]
        );
        
        // Update password if mobile changed
        if (mobile && cleanedMobile) {
            const newPassword = participantService.generatePassword(cleanedMobile);
            const passwordHash = await require('bcryptjs').hash(newPassword, 10);
            await db.query(
                'UPDATE user_credentials SET password_hash = $1 WHERE participant_id = $2',
                [passwordHash, id]
            );
        }
        
        res.json({
            success: true,
            message: 'Participant updated successfully',
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Update participant error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update participant'
        });
    }
});

// Toggle participant activation status
router.patch('/participants/:id/toggle-status', authorizeAdmin(), logAdminAction('toggle_participant_status'), async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get current status
        const participantResult = await db.query(
            'SELECT p.name, uc.is_active FROM participants p JOIN user_credentials uc ON p.id = uc.participant_id WHERE p.id = $1',
            [id]
        );
        
        if (participantResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Participant not found'
            });
        }
        
        const currentStatus = participantResult.rows[0].is_active;
        const newStatus = !currentStatus;
        const participantName = participantResult.rows[0].name;
        
        // Update status
        await db.query(
            'UPDATE user_credentials SET is_active = $1 WHERE participant_id = $2',
            [newStatus, id]
        );
        
        res.json({
            success: true,
            message: `Participant ${newStatus ? 'activated' : 'deactivated'} successfully`,
            data: {
                participantId: id,
                participantName: participantName,
                isActive: newStatus
            }
        });
        
    } catch (error) {
        console.error('Toggle participant status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update participant status'
        });
    }
});

// Send credentials to participants
router.post('/participants/send-credentials', authorizeAdmin(), logAdminAction('send_credentials'), async (req, res) => {
    try {
        const { participantIds, method = 'email' } = req.body;
        
        if (!participantIds || !Array.isArray(participantIds)) {
            return res.status(400).json({
                success: false,
                message: 'Participant IDs array is required'
            });
        }
        
        // Get participant credentials
        const credentialsResult = await db.query(`
            SELECT p.id as participant_id, p.name, p.email, p.mobile, uc.username, uc.password_hash
            FROM participants p
            JOIN user_credentials uc ON p.id = uc.participant_id
            WHERE p.id = ANY($1) AND uc.is_active = true
        `, [participantIds]);
        
        if (credentialsResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No valid participants found'
            });
        }
        
        // For security, we can't retrieve original passwords, so we need to generate new ones
        const credentialsList = [];
        
        for (const participant of credentialsResult.rows) {
            // Generate new password and update
            const newPassword = Math.random().toString(36).slice(-8);
            const bcrypt = require('bcryptjs');
            const passwordHash = await bcrypt.hash(newPassword, 10);
            
            await db.query(
                'UPDATE user_credentials SET password_hash = $1 WHERE participant_id = $2',
                [passwordHash, participant.participant_id]
            );
            
            credentialsList.push({
                participantId: participant.participant_id,
                name: participant.name,
                email: participant.email,
                mobile: participant.mobile,
                username: participant.username,
                password: newPassword
            });
        }
        
        // Send credentials
        const sendResults = await participantService.sendCredentials(credentialsList, method);
        
        res.json({
            success: true,
            message: `Credentials sent via ${method}`,
            data: {
                sent: sendResults.sent.length,
                failed: sendResults.failed.length,
                details: sendResults
            }
        });
        
    } catch (error) {
        console.error('Send credentials error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send credentials'
        });
    }
});

// Get participants list
router.get('/participants', authorizeAdmin(), async (req, res) => {
    try {
        const { page = 1, limit = 50, search = '' } = req.query;
        const offset = (page - 1) * limit;
        
        let querySQL, countSQL, queryParams, countParams;
        
        if (search && search.trim()) {
            // With search
            querySQL = `
                SELECT p.*, uc.username, uc.is_active, uc.last_login
                FROM participants p
                LEFT JOIN user_credentials uc ON p.id = uc.participant_id
                WHERE p.name ILIKE $3 OR p.email ILIKE $3 OR p.company ILIKE $3 OR p.designation ILIKE $3
                ORDER BY p.created_at DESC
                LIMIT $1 OFFSET $2
            `;
            queryParams = [parseInt(limit), parseInt(offset), `%${search.trim()}%`];
            
            countSQL = `
                SELECT COUNT(*) FROM participants p
                WHERE p.name ILIKE $1 OR p.email ILIKE $1 OR p.company ILIKE $1 OR p.designation ILIKE $1
            `;
            countParams = [`%${search.trim()}%`];
        } else {
            // Without search
            querySQL = `
                SELECT p.*, uc.username, uc.is_active, uc.last_login
                FROM participants p
                LEFT JOIN user_credentials uc ON p.id = uc.participant_id
                ORDER BY p.created_at DESC
                LIMIT $1 OFFSET $2
            `;
            queryParams = [parseInt(limit), parseInt(offset)];
            
            countSQL = `SELECT COUNT(*) FROM participants`;
            countParams = [];
        }
        
        const result = await db.query(querySQL, queryParams);
        const countResult = await db.query(countSQL, countParams);
        
        res.json({
            success: true,
            data: {
                participants: result.rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: parseInt(countResult.rows[0].count),
                    totalPages: Math.ceil(countResult.rows[0].count / limit)
                }
            }
        });
        
    } catch (error) {
        console.error('Get participants error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve participants'
        });
    }
});

// ==================== QUIZ MANAGEMENT ENDPOINTS ====================

// Get all quizzes with search and pagination
router.get('/quizzes', authorizeAdmin(), async (req, res) => {
    try {
        const { page = 1, limit = 20, search = '' } = req.query;
        const offset = (page - 1) * limit;
        
        let querySQL, countSQL, queryParams, countParams;
        
        if (search && search.trim()) {
            querySQL = `
                SELECT * FROM quizzes
                WHERE title ILIKE $3 OR description ILIKE $3
                ORDER BY created_at DESC
                LIMIT $1 OFFSET $2
            `;
            queryParams = [parseInt(limit), parseInt(offset), `%${search.trim()}%`];
            
            countSQL = `
                SELECT COUNT(*) FROM quizzes
                WHERE title ILIKE $1 OR description ILIKE $1
            `;
            countParams = [`%${search.trim()}%`];
        } else {
            querySQL = `
                SELECT * FROM quizzes
                ORDER BY created_at DESC
                LIMIT $1 OFFSET $2
            `;
            queryParams = [parseInt(limit), parseInt(offset)];
            
            countSQL = `SELECT COUNT(*) FROM quizzes`;
            countParams = [];
        }
        
        const result = await db.query(querySQL, queryParams);
        const countResult = await db.query(countSQL, countParams);
        
        res.json({
            success: true,
            data: {
                quizzes: result.rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: parseInt(countResult.rows[0].count),
                    totalPages: Math.ceil(countResult.rows[0].count / limit)
                }
            }
        });
        
    } catch (error) {
        console.error('Get quizzes error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve quizzes'
        });
    }
});

// Get single quiz details
router.get('/quizzes/:id', authorizeAdmin(), async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await db.query('SELECT * FROM quizzes WHERE id = $1', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Quiz not found'
            });
        }
        
        res.json({
            success: true,
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Get quiz error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get quiz'
        });
    }
});

// Create quiz
router.post('/quizzes', authorizeAdmin(), logAdminAction('create_quiz'), async (req, res) => {
    try {
        const { 
            title, 
            description, 
            start_date, 
            start_time = '04:00:00', 
            instruction_time_minutes = 5, 
            quiz_time_minutes = 15, 
            total_questions = 20,
            is_active = false
        } = req.body;
        
        if (!title || !start_date || !start_time) {
            return res.status(400).json({
                success: false,
                message: 'Title, start date, and start time are required'
            });
        }
        
        const result = await db.query(`
            INSERT INTO quizzes (title, description, start_date, start_time, instruction_time_minutes, quiz_time_minutes, total_questions, is_active, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `, [title, description, start_date, start_time, instruction_time_minutes, quiz_time_minutes, total_questions, is_active, req.user.id]);
        
        res.json({
            success: true,
            message: 'Quiz created successfully',
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Create quiz error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create quiz'
        });
    }
});

// Update quiz
router.put('/quizzes/:id', authorizeAdmin(), logAdminAction('edit_quiz'), async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            title, 
            description, 
            start_date, 
            start_time, 
            instruction_time_minutes, 
            quiz_time_minutes, 
            total_questions,
            is_active
        } = req.body;
        
        if (!title || !start_date || !start_time) {
            return res.status(400).json({
                success: false,
                message: 'Title, start date, and start time are required'
            });
        }
        
        const result = await db.query(`
            UPDATE quizzes 
            SET title = $1, description = $2, start_date = $3, start_time = $4, 
                instruction_time_minutes = $5, quiz_time_minutes = $6, total_questions = $7, 
                is_active = $8, updated_at = CURRENT_TIMESTAMP
            WHERE id = $9
            RETURNING *
        `, [title, description, start_date, start_time, instruction_time_minutes, quiz_time_minutes, total_questions, is_active, id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Quiz not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Quiz updated successfully',
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Update quiz error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update quiz'
        });
    }
});

// Toggle quiz status
router.patch('/quizzes/:id/toggle-status', authorizeAdmin(), logAdminAction('toggle_quiz_status'), async (req, res) => {
    try {
        const { id } = req.params;
        
        const quizResult = await db.query(
            'SELECT title, is_active FROM quizzes WHERE id = $1',
            [id]
        );
        
        if (quizResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Quiz not found'
            });
        }
        
        const currentStatus = quizResult.rows[0].is_active;
        const newStatus = !currentStatus;
        const quizTitle = quizResult.rows[0].title;
        
        await db.query(
            'UPDATE quizzes SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [newStatus, id]
        );
        
        res.json({
            success: true,
            message: `Quiz "${quizTitle}" ${newStatus ? 'activated' : 'deactivated'} successfully`,
            data: {
                quizId: id,
                quizTitle: quizTitle,
                isActive: newStatus
            }
        });
        
    } catch (error) {
        console.error('Toggle quiz status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update quiz status'
        });
    }
});

// Delete quiz
router.delete('/quizzes/:id', authorizeAdmin(), logAdminAction('delete_quiz'), async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await db.query('DELETE FROM quizzes WHERE id = $1 RETURNING title', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Quiz not found'
            });
        }
        
        res.json({
            success: true,
            message: `Quiz "${result.rows[0].title}" deleted successfully`
        });
        
    } catch (error) {
        console.error('Delete quiz error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete quiz'
        });
    }
});

// Get questions for a quiz
router.get('/quizzes/:quizId/questions', authorizeAdmin(), async (req, res) => {
    try {
        const { quizId } = req.params;
        
        const result = await db.query(`
            SELECT * FROM questions 
            WHERE quiz_id = $1 
            ORDER BY question_order ASC
        `, [quizId]);
        
        res.json({
            success: true,
            data: result.rows
        });
        
    } catch (error) {
        console.error('Get quiz questions error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get quiz questions'
        });
    }
});

// Create or update multiple questions for a quiz
router.post('/quizzes/:quizId/questions', authorizeAdmin(), logAdminAction('manage_questions'), async (req, res) => {
    try {
        const { quizId } = req.params;
        const { questions } = req.body;
        
        if (!Array.isArray(questions)) {
            return res.status(400).json({
                success: false,
                message: 'Questions must be an array'
            });
        }
        
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            
            // Clear existing questions
            await client.query('DELETE FROM questions WHERE quiz_id = $1', [quizId]);
            
            // Insert new questions
            for (let i = 0; i < questions.length; i++) {
                const q = questions[i];
                if (!q.question_text || !q.option_a || !q.option_b || !q.option_c || !q.option_d || !q.correct_answer) {
                    throw new Error(`Question ${i + 1} is missing required fields`);
                }
                
                await client.query(`
                    INSERT INTO questions (quiz_id, question_text, option_a, option_b, option_c, option_d, correct_answer, question_order)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                `, [quizId, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer, i + 1]);
            }
            
            // Update total questions count in quiz
            await client.query('UPDATE quizzes SET total_questions = $1 WHERE id = $2', [questions.length, quizId]);
            
            await client.query('COMMIT');
            
            res.json({
                success: true,
                message: `Successfully saved ${questions.length} questions`
            });
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
        
    } catch (error) {
        console.error('Save quiz questions error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to save quiz questions'
        });
    }
});

// Delete a specific question
router.delete('/quizzes/:quizId/questions/:questionId', authorizeAdmin(), logAdminAction('delete_question'), async (req, res) => {
    try {
        const { quizId, questionId } = req.params;
        
        const result = await db.query(
            'DELETE FROM questions WHERE id = $1 AND quiz_id = $2 RETURNING *',
            [questionId, quizId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Question not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Question deleted successfully'
        });
        
    } catch (error) {
        console.error('Delete question error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete question'
        });
    }
});

// Upload quiz questions
router.post('/quizzes/:quizId/questions/upload', authorizeAdmin(), upload.single('questionsFile'), logAdminAction('upload_questions'), async (req, res) => {
    try {
        const { quizId } = req.params;
        
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }
        
        const filePath = req.file.path;
        const fileExt = path.extname(req.file.originalname).toLowerCase();
        
        let questionsData = [];
        
        // Parse questions file
        if (fileExt === '.csv') {
            const csvData = fs.readFileSync(filePath, 'utf8');
            questionsData = parseQuestionsCSV(csvData);
        } else if (fileExt === '.xlsx' || fileExt === '.xls') {
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            questionsData = parseQuestionsExcel(jsonData);
        }
        
        // Insert questions
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            
            // Clear existing questions
            await client.query('DELETE FROM questions WHERE quiz_id = $1', [quizId]);
            
            for (let i = 0; i < questionsData.length; i++) {
                const q = questionsData[i];
                
                // Debug log the original data
                console.log(`Processing question ${i + 1}:`, {
                    original_correct_answer: q.correct_answer,
                    question_text: q.question || q.question_text,
                    option_a: q.option_a,
                    option_b: q.option_b,
                    option_c: q.option_c,
                    option_d: q.option_d
                });
                
                // Validate and clean the correct_answer field
                let correctAnswer = (q.correct_answer || '').toString().toLowerCase().trim();
                
                // Convert numeric answers to letters (1->a, 2->b, 3->c, 4->d)
                const numericMap = { '1': 'a', '2': 'b', '3': 'c', '4': 'd' };
                if (numericMap[correctAnswer]) {
                    correctAnswer = numericMap[correctAnswer];
                }
                
                // Extract just the first character if it's longer than 1
                if (correctAnswer.length > 1) {
                    // Check if it starts with a, b, c, or d
                    const match = correctAnswer.match(/^[abcd]/);
                    correctAnswer = match ? match[0] : '';
                }
                
                console.log(`Cleaned correct_answer for question ${i + 1}: "${correctAnswer}"`);
                
                // Validate that it's a valid option
                if (!['a', 'b', 'c', 'd'].includes(correctAnswer)) {
                    throw new Error(`Invalid correct_answer "${q.correct_answer}" for question ${i + 1}. Must be 'a', 'b', 'c', 'd' or '1', '2', '3', '4'. 
                    
Check your CSV format - it should be:
question_text,option_a,option_b,option_c,option_d,correct_answer

Your file appears to have the columns in wrong order or the correct_answer column contains option text instead of a letter/number.`);
                }
                
                await client.query(`
                    INSERT INTO questions (quiz_id, question_text, option_a, option_b, option_c, option_d, correct_answer, question_order)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                `, [quizId, q.question || q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, correctAnswer, i + 1]);
            }
            
            // Update quiz total questions
            await client.query('UPDATE quizzes SET total_questions = $1 WHERE id = $2', [questionsData.length, quizId]);
            
            await client.query('COMMIT');
            
            res.json({
                success: true,
                message: `Uploaded ${questionsData.length} questions successfully`,
                data: { questionsCount: questionsData.length }
            });
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
        
        // Clean up file
        fs.unlinkSync(filePath);
        
    } catch (error) {
        console.error('Upload questions error:', error);
        
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({
            success: false,
            message: 'Failed to upload questions'
        });
    }
});

// Session Management - Create quiz session (OLD - DISABLED)
/*router.post('/sessions', authorizeAdmin(), logAdminAction('create_session'), async (req, res) => {
    try {
        const { quizId, sessionName, startTime, maxParticipants = 1000 } = req.body;
        
        if (!quizId || !sessionName || !startTime) {
            return res.status(400).json({
                success: false,
                message: 'Quiz ID, session name, and start time are required'
            });
        }
        
        const result = await db.query(`
            INSERT INTO quiz_sessions (quiz_id, session_name, start_time, max_participants)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `, [quizId, sessionName, startTime, maxParticipants]);
        
        res.json({
            success: true,
            message: 'Quiz session created successfully',
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Create session error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create quiz session'
        });
    }
});*/

// Start quiz session (instruction phase) (OLD - DISABLED)
/*router.post('/sessions/:sessionId/start-instruction', authorizeAdmin(), logAdminAction('start_instruction'), async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        await db.query(
            'UPDATE quiz_sessions SET status = $1, instruction_start_time = CURRENT_TIMESTAMP WHERE id = $2',
            ['instruction', sessionId]
        );
        
        // Broadcast to participants via Socket.io
        const io = req.app.get('io');
        if (io) {
            io.to(`session_${sessionId}`).emit('instruction_phase_started', {
                sessionId: sessionId,
                instructionTime: 5 * 60 * 1000 // 5 minutes
            });
        }
        
        res.json({
            success: true,
            message: 'Instruction phase started'
        });
        
    } catch (error) {
        console.error('Start instruction error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to start instruction phase'
        });
    }
});

// Start quiz timer
router.post('/sessions/:sessionId/start-quiz', authorizeAdmin(), logAdminAction('start_quiz'), async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        await db.query(
            'UPDATE quiz_sessions SET status = $1, quiz_start_time = CURRENT_TIMESTAMP WHERE id = $2',
            ['active', sessionId]
        );
        
        // Set timer in Redis
        const timerData = {
            startTime: Date.now(),
            duration: 15 * 60 * 1000, // 15 minutes
            sessionId: sessionId
        };
        
        await redisHelper.setTimer(sessionId, timerData);
        
        // Broadcast to participants
        const io = req.app.get('io');
        if (io) {
            io.to(`session_${sessionId}`).emit('quiz_started', {
                sessionId: sessionId,
                startTime: Date.now(),
                duration: 15 * 60 * 1000
            });
        }
        
        res.json({
            success: true,
            message: 'Quiz timer started',
            data: { startTime: Date.now(), duration: 15 * 60 * 1000 }
        });
        
    } catch (error) {
        console.error('Start quiz timer error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to start quiz timer'
        });
    }
});

// Get session participants and live monitoring
router.get('/sessions/:sessionId/participants', authorizeAdmin(), async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        const participants = await participantService.getSessionParticipants(sessionId);
        
        // Get live status from Redis
        const liveParticipants = await redisHelper.getSessionParticipants(sessionId);
        
        res.json({
            success: true,
            data: {
                participants: participants,
                liveCount: liveParticipants.length,
                liveParticipants: liveParticipants
            }
        });
        
    } catch (error) {
        console.error('Get session participants error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get session participants'
        });
    }
});

// Results and reporting
router.get('/sessions/:sessionId/results', authorizeAdmin(), async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        const results = await db.query(`
            SELECT r.*, p.name, p.email, p.designation, p.company,
                   pw.prize_position
            FROM results r
            JOIN participants p ON r.participant_id = p.id
            LEFT JOIN prize_winners pw ON r.session_id = pw.session_id AND r.participant_id = pw.participant_id
            WHERE r.session_id = $1
            ORDER BY r.total_score DESC, r.completion_time_seconds ASC
        `, [sessionId]);
        
        res.json({
            success: true,
            data: results.rows
        });
        
    } catch (error) {
        console.error('Get session results error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get session results'
        });
    }
});*/

// Helper functions for parsing questions
function parseQuestionsCSV(csvData) {
    const lines = csvData.split('\n');
    const questions = [];
    
    if (lines.length < 2) return questions;
    
    // Helper function to parse CSV line with proper quote handling
    function parseCSVLine(line) {
        const fields = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                fields.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        
        // Add the last field
        fields.push(current.trim());
        
        return fields;
    }
    
    // Parse header to get column indices
    const headerLine = lines[0].trim();
    const headers = parseCSVLine(headerLine).map(h => h.toLowerCase());
    
    // Find column indices
    const getColumnIndex = (possibleNames) => {
        for (const name of possibleNames) {
            const index = headers.indexOf(name.toLowerCase());
            if (index !== -1) return index;
        }
        return -1;
    };
    
    const questionIndex = getColumnIndex(['question_text', 'question', 'q']);
    const optionAIndex = getColumnIndex(['option_a', 'option a', 'a']);
    const optionBIndex = getColumnIndex(['option_b', 'option b', 'b']);
    const optionCIndex = getColumnIndex(['option_c', 'option c', 'c']);
    const optionDIndex = getColumnIndex(['option_d', 'option d', 'd']);
    const correctAnswerIndex = getColumnIndex(['correct_answer', 'correct answer', 'answer', 'ans']);
    
    console.log('CSV column mapping:', {
        headers,
        questionIndex,
        optionAIndex,
        optionBIndex,
        optionCIndex,
        optionDIndex,
        correctAnswerIndex
    });
    
    for (let i = 1; i < lines.length; i++) { // Skip header
        const line = lines[i].trim();
        if (!line) continue;
        
        const fields = parseCSVLine(line);
        
        console.log(`CSV Line ${i} parsed fields:`, fields);
        
        if (fields.length >= 6 && questionIndex !== -1 && correctAnswerIndex !== -1) {
            questions.push({
                question: fields[questionIndex] || '',
                option_a: fields[optionAIndex] || '',
                option_b: fields[optionBIndex] || '',
                option_c: fields[optionCIndex] || '',
                option_d: fields[optionDIndex] || '',
                correct_answer: (fields[correctAnswerIndex] || '').toString().toLowerCase().trim(),
                explanation: ''
            });
        }
    }
    
    return questions;
}

function parseQuestionsExcel(jsonData) {
    return jsonData.map(row => ({
        question: row.Question || row.question || '',
        option_a: row['Option A'] || row.option_a || '',
        option_b: row['Option B'] || row.option_b || '',
        option_c: row['Option C'] || row.option_c || '',
        option_d: row['Option D'] || row.option_d || '',
        correct_answer: (row['Correct Answer'] || row.correct_answer || '').toString().toLowerCase().trim(),
        explanation: row.Explanation || row.explanation || ''
    }));
}

// ===== SESSION MANAGEMENT ENDPOINTS =====

// Get all sessions with filtering and pagination
router.get('/sessions', authorizeAdmin(), async (req, res) => {
    try {
        const { search, status, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;
        
        let conditions = [];
        let queryParams = [];
        
        if (search) {
            conditions.push(`qs.session_name ILIKE $${queryParams.length + 1}`);
            queryParams.push(`%${search}%`);
        }
        
        if (status) {
            conditions.push(`qs.status = $${queryParams.length + 1}`);
            queryParams.push(status);
        }
        
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        
        // Main query - using the working pattern from dashboard
        const sessionsQuery = `
            SELECT 
                qs.*,
                qs.session_name as title,
                q.title as quiz_title,
                q.total_questions,
                qs.current_participants as connected_participants
            FROM quiz_sessions qs
            LEFT JOIN quizzes q ON qs.quiz_id = q.id
            ${whereClause}
            ORDER BY qs.created_at DESC
            LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
        `;
        
        queryParams.push(limit, offset);
        
        const sessions = await db.query(sessionsQuery, queryParams);
        
        // Add computed fields for frontend compatibility
        const sessionData = sessions.rows.map(session => ({
            ...session,
            scheduled_date: session.start_time ? new Date(session.start_time).toISOString().split('T')[0] : null,
            scheduled_time: session.start_time ? new Date(session.start_time).toTimeString().split(' ')[0] : null
        }));
        
        // Get statistics
        const statsQuery = `
            SELECT 
                COUNT(CASE WHEN status IN ('instruction', 'active') THEN 1 END) as active,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
                COUNT(CASE WHEN DATE(start_time) = CURRENT_DATE THEN 1 END) as scheduled_today,
                COALESCE(SUM(CASE WHEN status IN ('instruction', 'active') THEN current_participants ELSE 0 END), 0) as live_participants
            FROM quiz_sessions
        `;
        
        const stats = await db.query(statsQuery);
        
        res.json({
            success: true,
            data: sessionData,
            stats: stats.rows[0]
        });
        
    } catch (error) {
        console.error('Get sessions error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get sessions'
        });
    }
});

// Get single session
router.get('/sessions/:id', authorizeAdmin(), async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!id || id === 'undefined' || id === 'null' || id === '[object Object]' || isNaN(parseInt(id))) {
            return res.status(400).json({
                success: false,
                message: 'Invalid session ID provided'
            });
        }
        
        const sessionId = parseInt(id);
        
        const result = await db.query(`
            SELECT 
                qs.*,
                qs.session_name as title,
                q.title as quiz_title,
                q.total_questions,
                q.instruction_time_minutes as quiz_instruction_time,
                q.quiz_time_minutes
            FROM quiz_sessions qs
            LEFT JOIN quizzes q ON qs.quiz_id = q.id
            WHERE qs.id = $1
        `, [sessionId]);
        
        // Add computed fields if session found
        if (result.rows.length > 0) {
            const session = result.rows[0];
            session.scheduled_date = session.start_time ? new Date(session.start_time).toISOString().split('T')[0] : null;
            session.scheduled_time = session.start_time ? new Date(session.start_time).toTimeString().split(' ')[0] : null;
        }
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }
        
        res.json({
            success: true,
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Get session error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get session'
        });
    }
});

// Create new session
router.post('/sessions', authorizeAdmin(), logAdminAction('create_session'), async (req, res) => {
    try {
        const {
            title,
            quiz_id,
            scheduled_date,
            scheduled_time,
            max_participants = 1000,
            instruction_time_minutes = 5,
            description,
            auto_start = false
        } = req.body;
        
        if (!title || !quiz_id || !scheduled_date || !scheduled_time) {
            return res.status(400).json({
                success: false,
                message: 'Quiz ID, session name, and start time are required'
            });
        }
        
        // Verify quiz exists and is active
        const quizCheck = await db.query(
            'SELECT id, title, total_questions FROM quizzes WHERE id = $1 AND is_active = true',
            [quiz_id]
        );
        
        if (quizCheck.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Selected quiz not found or inactive'
            });
        }
        
        // Combine date and time into a proper timestamp with timezone awareness
        const startDateTime = createTimezoneDate(scheduled_date, scheduled_time);
        
        // Validate that the session is not scheduled for the past
        const now = new Date();
        const timeDiff = (startDateTime.getTime() - now.getTime()) / 1000;
        
        // Allow sessions to be scheduled at least 1 minute in the future
        if (timeDiff < 60) {
            return res.status(400).json({
                success: false,
                message: 'Session must be scheduled at least 1 minute in the future'
            });
        }
        
        // Log for debugging
        console.log('[Session Creation] Scheduled for:', {
            date: scheduled_date,
            time: scheduled_time,
            timezoneInfo: getTimezoneInfo(),
            startDateTime: startDateTime.toISOString(),
            localDisplay: formatInTimezone(startDateTime),
            currentTime: now.toISOString(),
            timeDiffSeconds: timeDiff.toFixed(2)
        });
        
        const result = await db.query(`
            INSERT INTO quiz_sessions (
                session_name, quiz_id, start_time, max_participants, auto_start, status
            ) VALUES ($1, $2, $3, $4, $5, 'scheduled')
            RETURNING *
        `, [
            title, quiz_id, startDateTime, max_participants, auto_start
        ]);
        
        // Add the computed fields
        const sessionData = result.rows[0];
        sessionData.title = sessionData.session_name;
        sessionData.scheduled_date = sessionData.start_time ? new Date(sessionData.start_time).toISOString().split('T')[0] : null;
        sessionData.scheduled_time = sessionData.start_time ? new Date(sessionData.start_time).toTimeString().split(' ')[0] : null;
        
        res.json({
            success: true,
            data: sessionData,
            message: 'Session created successfully'
        });
        
    } catch (error) {
        console.error('Create session error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create session'
        });
    }
});

// Update session
router.put('/sessions/:id', authorizeAdmin(), logAdminAction('update_session'), async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title,
            scheduled_date,
            scheduled_time,
            max_participants,
            instruction_time_minutes,
            description,
            auto_start
        } = req.body;
        
        // Check if session can be updated
        const statusCheck = await db.query(
            'SELECT status FROM quiz_sessions WHERE id = $1',
            [id]
        );
        
        if (statusCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }
        
        if (statusCheck.rows[0].status !== 'scheduled') {
            return res.status(400).json({
                success: false,
                message: 'Cannot update session that has already started'
            });
        }
        
        // Combine date and time into a proper timestamp with timezone awareness
        const startDateTime = createTimezoneDate(scheduled_date, scheduled_time);
        
        // Validate that the session is not scheduled for the past
        const now = new Date();
        const timeDiff = (startDateTime.getTime() - now.getTime()) / 1000;
        
        // Allow sessions to be scheduled at least 1 minute in the future
        if (timeDiff < 60) {
            return res.status(400).json({
                success: false,
                message: 'Session must be scheduled at least 1 minute in the future'
            });
        }
        
        // Log for debugging
        console.log('[Session Update] Scheduled for:', {
            date: scheduled_date,
            time: scheduled_time,
            timezoneInfo: getTimezoneInfo(),
            startDateTime: startDateTime.toISOString(),
            localDisplay: formatInTimezone(startDateTime),
            currentTime: now.toISOString(),
            timeDiffSeconds: timeDiff.toFixed(2)
        });
        
        const result = await db.query(`
            UPDATE quiz_sessions 
            SET session_name = $1, start_time = $2, max_participants = $3, auto_start = $4
            WHERE id = $5
            RETURNING *
        `, [
            title, startDateTime, max_participants, auto_start, id
        ]);
        
        // Add computed fields
        if (result.rows.length > 0) {
            const session = result.rows[0];
            session.title = session.session_name;
            session.scheduled_date = session.start_time ? new Date(session.start_time).toISOString().split('T')[0] : null;
            session.scheduled_time = session.start_time ? new Date(session.start_time).toTimeString().split(' ')[0] : null;
        }
        
        res.json({
            success: true,
            data: result.rows[0],
            message: 'Session updated successfully'
        });
        
    } catch (error) {
        console.error('Update session error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update session'
        });
    }
});

// Delete session
router.delete('/sessions/:id', authorizeAdmin(), logAdminAction('delete_session'), async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check if session can be deleted
        const statusCheck = await db.query(
            'SELECT status FROM quiz_sessions WHERE id = $1',
            [id]
        );
        
        if (statusCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }
        
        if (['instruction', 'active'].includes(statusCheck.rows[0].status)) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete active session'
            });
        }
        
        const result = await db.query(
            'DELETE FROM quiz_sessions WHERE id = $1 RETURNING *',
            [id]
        );
        
        res.json({
            success: true,
            message: 'Session deleted successfully'
        });
        
    } catch (error) {
        console.error('Delete session error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete session'
        });
    }
});

// Start instruction phase
router.post('/sessions/:id/start-instruction', authorizeAdmin(), logAdminAction('start_instruction'), async (req, res) => {
    try {
        const { id } = req.params;
        
        // First get session and quiz details with instruction time
        const sessionResult = await db.query(`
            SELECT qs.*, q.instruction_time_minutes, q.quiz_time_minutes
            FROM quiz_sessions qs
            JOIN quizzes q ON qs.quiz_id = q.id
            WHERE qs.id = $1 AND qs.status = 'scheduled'
        `, [id]);
        
        if (sessionResult.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Session not found or cannot start instruction phase'
            });
        }
        
        const session = sessionResult.rows[0];
        
        // Update session to instruction phase using the scheduled start time
        const result = await db.query(`
            UPDATE quiz_sessions 
            SET status = 'instruction', 
                instruction_start_time = start_time
            WHERE id = $1 AND status = 'scheduled'
            RETURNING *, session_name as title
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Session not found or cannot start instruction phase'
            });
        }
        
        const instructionTimeMinutes = session.instruction_time_minutes || 5;
        
        // Emit socket event to notify participants
        req.app.get('io').to(`session_${id}`).emit('instruction_started', {
            sessionId: id,
            instructionTimeMinutes: instructionTimeMinutes
        });
        
        console.log(`[Manual Start] Instruction phase started for session ${id}, will auto-transition to quiz phase after ${instructionTimeMinutes} minutes`);
        console.log(`[Manual Start] Auto-transition will be handled by the session scheduler checking database timestamps`);
        
        res.json({
            success: true,
            data: result.rows[0],
            message: 'Instruction phase started'
        });
        
    } catch (error) {
        console.error('Start instruction error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to start instruction phase'
        });
    }
});

// Start quiz phase
router.post('/sessions/:id/start-quiz', authorizeAdmin(), logAdminAction('start_quiz'), async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await db.query(`
            UPDATE quiz_sessions 
            SET status = 'active', 
                quiz_start_time = instruction_start_time + INTERVAL '1 minute' * COALESCE((SELECT instruction_time_minutes FROM quizzes WHERE id = quiz_id), 5)
            WHERE id = $1 AND status = 'instruction'
            RETURNING *, session_name as title
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Session not found or cannot start quiz phase'
            });
        }
        
        // Emit socket event to notify participants
        req.app.get('io').to(`session_${id}`).emit('quiz_started', {
            sessionId: id,
            quizTimeMinutes: result.rows[0].quiz_time_minutes || 15
        });
        
        res.json({
            success: true,
            data: result.rows[0],
            message: 'Quiz phase started'
        });
        
    } catch (error) {
        console.error('Start quiz error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to start quiz phase'
        });
    }
});

// End session
router.post('/sessions/:id/end', authorizeAdmin(), logAdminAction('end_session'), async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await db.query(`
            UPDATE quiz_sessions 
            SET status = 'completed', 
                end_time = CURRENT_TIMESTAMP
            WHERE id = $1 AND status IN ('instruction', 'active')
            RETURNING *, session_name as title
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Session not found or cannot end session'
            });
        }
        
        // Calculate results for all participants now that session has ended
        try {
            const { calculateSessionResults, calculatePrizeWinners } = require('../utils/prizeCalculator');
            console.log(`Session ${id} ended - calculating all results and prize winners`);
            
            // Calculate all participant results with proper rankings
            await calculateSessionResults(id);
            
            // Calculate and assign prize winners
            await calculatePrizeWinners(id);
            
            console.log(`Results and prize winners calculated for session ${id}`);
        } catch (calcError) {
            console.error('Error calculating results when session ended:', calcError);
            // Don't fail the session ending if result calculation fails
        }
        
        // Emit socket event to notify participants
        req.app.get('io').to(`session_${id}`).emit('session_ended', {
            sessionId: id
        });
        
        res.json({
            success: true,
            data: result.rows[0],
            message: 'Session ended successfully'
        });
        
    } catch (error) {
        console.error('End session error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to end session'
        });
    }
});

// Get participants for a session
router.get('/sessions/:id/participants', authorizeAdmin(), async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await db.query(`
            SELECT 
                sp.*,
                p.name,
                p.email,
                p.designation,
                p.company
            FROM session_participants sp
            JOIN participants p ON sp.participant_id = p.id
            WHERE sp.session_id = $1
            ORDER BY sp.joined_at ASC
        `, [id]);
        
        res.json({
            success: true,
            data: result.rows
        });
        
    } catch (error) {
        console.error('Get session participants error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get session participants'
        });
    }
});

// Get session results
router.get('/sessions/:id/results', authorizeAdmin(), async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await db.query(`
            SELECT 
                r.*,
                p.name,
                p.email,
                p.designation,
                p.company
            FROM results r
            JOIN participants p ON r.participant_id = p.id
            WHERE r.session_id = $1
            ORDER BY r.rank_position ASC NULLS LAST, r.total_score DESC, r.completion_time_seconds ASC
        `, [id]);
        
        res.json({
            success: true,
            data: result.rows
        });
        
    } catch (error) {
        console.error('Get session results error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get session results'
        });
    }
});

// ===== RESULTS & ANALYTICS ENDPOINTS =====

// Get results dashboard overview
router.get('/results', authorizeAdmin(), async (req, res) => {
    try {
        // Get overall statistics
        const statsQuery = `
            SELECT 
                COUNT(DISTINCT r.session_id) as total_sessions_with_results,
                COUNT(*) as total_participants,
                AVG(r.percentage_score) as avg_score,
                AVG(r.completion_time_seconds) as avg_completion_time,
                COUNT(CASE WHEN r.performance_category = 'Excellent' THEN 1 END) as excellent_count,
                COUNT(CASE WHEN r.performance_category = 'Good' THEN 1 END) as good_count,
                COUNT(CASE WHEN r.performance_category = 'Needs Improvement' THEN 1 END) as needs_improvement_count,
                COUNT(DISTINCT pw.participant_id) as total_prize_winners
            FROM results r
            LEFT JOIN prize_winners pw ON r.session_id = pw.session_id AND r.participant_id = pw.participant_id
        `;
        
        const stats = await db.query(statsQuery);
        
        // Get recent sessions with results
        const recentSessionsQuery = `
            SELECT 
                qs.id,
                qs.session_name,
                q.title as quiz_title,
                qs.start_time,
                qs.status,
                COUNT(r.id) as participant_count,
                AVG(r.percentage_score) as avg_score,
                AVG(r.completion_time_seconds) as avg_completion_time
            FROM quiz_sessions qs
            JOIN quizzes q ON qs.quiz_id = q.id
            LEFT JOIN results r ON qs.id = r.session_id
            WHERE qs.status = 'completed'
            GROUP BY qs.id, qs.session_name, q.title, qs.start_time, qs.status
            HAVING COUNT(r.id) > 0
            ORDER BY qs.start_time DESC
            LIMIT 10
        `;
        
        const recentSessions = await db.query(recentSessionsQuery);
        
        // Get top performers (last 30 days)
        const topPerformersQuery = `
            SELECT 
                p.name,
                p.company,
                p.designation,
                r.total_score,
                r.percentage_score,
                r.completion_time_seconds,
                qs.session_name,
                q.title as quiz_title,
                pw.prize_position
            FROM results r
            JOIN participants p ON r.participant_id = p.id
            JOIN quiz_sessions qs ON r.session_id = qs.id
            JOIN quizzes q ON qs.quiz_id = q.id
            LEFT JOIN prize_winners pw ON r.session_id = pw.session_id AND r.participant_id = pw.participant_id
            WHERE r.created_at >= CURRENT_DATE - INTERVAL '30 days'
            ORDER BY r.percentage_score DESC, r.completion_time_seconds ASC
            LIMIT 20
        `;
        
        const topPerformers = await db.query(topPerformersQuery);
        
        res.json({
            success: true,
            data: {
                statistics: stats.rows[0],
                recentSessions: recentSessions.rows,
                topPerformers: topPerformers.rows
            }
        });
        
    } catch (error) {
        console.error('Get results dashboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load results dashboard'
        });
    }
});

// Get session results list with filtering
router.get('/results/sessions', authorizeAdmin(), async (req, res) => {
    try {
        const { search, date_from, date_to, quiz_id, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;
        
        let conditions = [];
        let queryParams = [];
        
        if (search) {
            conditions.push(`(qs.session_name ILIKE $${queryParams.length + 1} OR q.title ILIKE $${queryParams.length + 1})`);
            queryParams.push(`%${search}%`);
        }
        
        if (date_from) {
            conditions.push(`DATE(qs.start_time) >= $${queryParams.length + 1}`);
            queryParams.push(date_from);
        }
        
        if (date_to) {
            conditions.push(`DATE(qs.start_time) <= $${queryParams.length + 1}`);
            queryParams.push(date_to);
        }
        
        if (quiz_id) {
            conditions.push(`qs.quiz_id = $${queryParams.length + 1}`);
            queryParams.push(quiz_id);
        }
        
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')} AND` : 'WHERE';
        
        const sessionsQuery = `
            SELECT 
                qs.id,
                qs.session_name,
                q.title as quiz_title,
                q.total_questions,
                qs.start_time,
                qs.status,
                COUNT(r.id) as participant_count,
                AVG(r.percentage_score) as avg_score,
                AVG(r.completion_time_seconds) as avg_completion_time,
                MAX(r.percentage_score) as highest_score,
                MIN(r.percentage_score) as lowest_score,
                COUNT(pw.participant_id) as prize_winners_count
            FROM quiz_sessions qs
            JOIN quizzes q ON qs.quiz_id = q.id
            LEFT JOIN results r ON qs.id = r.session_id
            LEFT JOIN prize_winners pw ON qs.id = pw.session_id
            ${whereClause} qs.status = 'completed'
            GROUP BY qs.id, qs.session_name, q.title, q.total_questions, qs.start_time, qs.status
            HAVING COUNT(r.id) > 0
            ORDER BY qs.start_time DESC
            LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
        `;
        
        queryParams.push(limit, offset);
        
        const sessions = await db.query(sessionsQuery, queryParams);
        
        // Get total count for pagination
        const countQuery = `
            SELECT COUNT(DISTINCT qs.id) as total
            FROM quiz_sessions qs
            JOIN quizzes q ON qs.quiz_id = q.id
            LEFT JOIN results r ON qs.id = r.session_id
            ${whereClause} qs.status = 'completed'
            HAVING COUNT(r.id) > 0
        `;
        
        const countResult = await db.query(countQuery, queryParams.slice(0, -2));
        const total = countResult.rows[0]?.total || 0;
        
        res.json({
            success: true,
            data: sessions.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: parseInt(total),
                pages: Math.ceil(total / limit)
            }
        });
        
    } catch (error) {
        console.error('Get session results list error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load session results'
        });
    }
});

// Get detailed session analysis
router.get('/results/session/:id', authorizeAdmin(), async (req, res) => {
    try {
        const { id } = req.params;
        
        // Validate session ID
        if (!id || isNaN(parseInt(id))) {
            return res.status(400).json({
                success: false,
                message: 'Invalid session ID provided'
            });
        }
        
        const sessionId = parseInt(id);
        
        // Get session basic info
        const sessionInfo = await db.query(`
            SELECT 
                qs.id,
                qs.session_name,
                qs.start_time,
                qs.status,
                qs.max_participants,
                q.title as quiz_title,
                q.total_questions,
                q.instruction_time_minutes,
                q.quiz_time_minutes
            FROM quiz_sessions qs
            JOIN quizzes q ON qs.quiz_id = q.id
            WHERE qs.id = $1
        `, [sessionId]);
        
        if (sessionInfo.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }
        
        // Get participant results with rankings
        const participantResults = await db.query(`
            SELECT 
                r.*,
                p.name,
                p.email,
                p.designation,
                p.company,
                pw.prize_position,
                sp.joined_at,
                sp.started_quiz_at,
                sp.submitted_at
            FROM results r
            JOIN participants p ON r.participant_id = p.id
            LEFT JOIN prize_winners pw ON r.session_id = pw.session_id AND r.participant_id = pw.participant_id
            LEFT JOIN session_participants sp ON r.session_id = sp.session_id AND r.participant_id = sp.participant_id
            WHERE r.session_id = $1
            ORDER BY r.rank_position ASC NULLS LAST, r.total_score DESC, r.completion_time_seconds ASC
        `, [sessionId]);
        
        // Get question performance analysis
        const questionAnalysis = await db.query(`
            SELECT 
                q.id,
                q.question_text,
                q.correct_answer,
                q.question_order,
                COUNT(pa.id) as total_attempts,
                COUNT(CASE WHEN pa.is_correct = true THEN 1 END) as correct_answers,
                COUNT(CASE WHEN pa.is_correct = false THEN 1 END) as incorrect_answers,
                COUNT(CASE WHEN pa.selected_answer IS NULL THEN 1 END) as unanswered,
                AVG(pa.time_taken_seconds) as avg_time_taken,
                ROUND(
                    (COUNT(CASE WHEN pa.is_correct = true THEN 1 END) * 100.0 / NULLIF(COUNT(pa.id), 0)), 2
                ) as success_rate
            FROM questions q
            JOIN quiz_sessions qs ON q.quiz_id = qs.quiz_id
            LEFT JOIN participant_answers pa ON q.id = pa.question_id AND pa.session_id = qs.id
            WHERE qs.id = $1
            GROUP BY q.id, q.question_text, q.correct_answer, q.question_order
            ORDER BY q.question_order ASC
        `, [sessionId]);
        
        // Get performance distribution
        const performanceDistribution = await db.query(`
            SELECT 
                performance_category,
                COUNT(*) as count,
                ROUND(AVG(percentage_score), 2) as avg_score,
                ROUND(AVG(completion_time_seconds), 2) as avg_time
            FROM results
            WHERE session_id = $1
            GROUP BY performance_category
        `, [sessionId]);
        
        // Get score distribution (binned)
        const scoreDistribution = await db.query(`
            SELECT 
                CASE 
                    WHEN percentage_score >= 90 THEN '90-100%'
                    WHEN percentage_score >= 80 THEN '80-89%'
                    WHEN percentage_score >= 70 THEN '70-79%'
                    WHEN percentage_score >= 60 THEN '60-69%'
                    WHEN percentage_score >= 50 THEN '50-59%'
                    ELSE 'Below 50%'
                END as score_range,
                COUNT(*) as count
            FROM results
            WHERE session_id = $1
            GROUP BY score_range
            ORDER BY 
                CASE 
                    WHEN percentage_score >= 90 THEN 1
                    WHEN percentage_score >= 80 THEN 2
                    WHEN percentage_score >= 70 THEN 3
                    WHEN percentage_score >= 60 THEN 4
                    WHEN percentage_score >= 50 THEN 5
                    ELSE 6
                END
        `, [sessionId]);
        
        // Get time analysis
        const timeAnalysis = await db.query(`
            SELECT 
                MIN(completion_time_seconds) as fastest_time,
                MAX(completion_time_seconds) as slowest_time,
                AVG(completion_time_seconds) as average_time,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY completion_time_seconds) as median_time
            FROM results
            WHERE session_id = $1
        `, [sessionId]);
        
        res.json({
            success: true,
            data: {
                session: sessionInfo.rows[0],
                participants: participantResults.rows,
                questionAnalysis: questionAnalysis.rows,
                performanceDistribution: performanceDistribution.rows,
                scoreDistribution: scoreDistribution.rows,
                timeAnalysis: timeAnalysis.rows[0]
            }
        });
        
    } catch (error) {
        console.error('Get detailed session analysis error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get session analysis'
        });
    }
});

// Export session results
router.get('/results/export/:id', authorizeAdmin(), async (req, res) => {
    try {
        const { id } = req.params;
        const { format = 'csv' } = req.query;
        
        // Validate session ID
        if (!id || isNaN(parseInt(id))) {
            return res.status(400).json({
                success: false,
                message: 'Invalid session ID provided'
            });
        }
        
        const sessionId = parseInt(id);
        
        // Get session info and results
        const exportData = await db.query(`
            SELECT 
                qs.session_name,
                qs.start_time,
                q.title as quiz_title,
                q.total_questions,
                p.name,
                p.email,
                p.designation,
                p.company,
                r.total_score,
                r.percentage_score,
                r.correct_answers,
                r.incorrect_answers,
                r.unanswered,
                r.completion_time_seconds,
                r.rank_position,
                r.performance_category,
                pw.prize_position,
                sp.joined_at,
                sp.started_quiz_at,
                sp.submitted_at
            FROM results r
            JOIN participants p ON r.participant_id = p.id
            JOIN quiz_sessions qs ON r.session_id = qs.id
            JOIN quizzes q ON qs.quiz_id = q.id
            LEFT JOIN prize_winners pw ON r.session_id = pw.session_id AND r.participant_id = pw.participant_id
            LEFT JOIN session_participants sp ON r.session_id = sp.session_id AND r.participant_id = sp.participant_id
            WHERE r.session_id = $1
            ORDER BY r.rank_position ASC NULLS LAST, r.total_score DESC
        `, [sessionId]);
        
        if (exportData.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No results found for this session'
            });
        }
        
        if (format === 'csv') {
            // Generate CSV
            const csvHeader = [
                'Rank', 'Name', 'Email', 'Designation', 'Company',
                'Score (%)', 'Correct', 'Incorrect', 'Unanswered',
                'Completion Time (seconds)', 'Performance Category',
                'Prize Position', 'Joined At', 'Started At', 'Submitted At'
            ];
            
            const csvRows = exportData.rows.map(row => [
                row.rank_position || '',
                row.name,
                row.email,
                row.designation || '',
                row.company || '',
                row.percentage_score,
                row.correct_answers,
                row.incorrect_answers,
                row.unanswered,
                row.completion_time_seconds,
                row.performance_category || '',
                row.prize_position || '',
                row.joined_at ? new Date(row.joined_at).toISOString() : '',
                row.started_quiz_at ? new Date(row.started_quiz_at).toISOString() : '',
                row.submitted_at ? new Date(row.submitted_at).toISOString() : ''
            ]);
            
            const csvContent = [csvHeader, ...csvRows]
                .map(row => row.map(field => `"${field}"`).join(','))
                .join('\n');
            
            const sessionName = exportData.rows[0].session_name.replace(/[^a-z0-9]/gi, '_');
            const filename = `${sessionName}_results_${new Date().toISOString().split('T')[0]}.csv`;
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send(csvContent);
        } else {
            res.status(400).json({
                success: false,
                message: 'Unsupported export format. Only CSV is currently supported.'
            });
        }
        
    } catch (error) {
        console.error('Export session results error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to export session results'
        });
    }
});

// Get participant performance history across sessions
router.get('/participants/:id/history', authorizeAdmin(), async (req, res) => {
    try {
        const { id } = req.params;
        
        // Validate participant ID
        if (!id || isNaN(parseInt(id))) {
            return res.status(400).json({
                success: false,
                message: 'Invalid participant ID provided'
            });
        }
        
        const participantId = parseInt(id);
        
        // Get participant basic info
        const participantInfo = await db.query(`
            SELECT 
                p.id,
                p.name,
                p.email,
                p.designation,
                p.company,
                p.mobile,
                p.created_at
            FROM participants p
            WHERE p.id = $1
        `, [participantId]);
        
        if (participantInfo.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Participant not found'
            });
        }
        
        // Get session history with results
        const sessionHistory = await db.query(`
            SELECT 
                qs.id as session_id,
                qs.session_name,
                qs.start_time,
                q.title as quiz_title,
                q.total_questions,
                r.total_score,
                r.percentage_score,
                r.correct_answers,
                r.incorrect_answers,
                r.unanswered,
                r.completion_time_seconds,
                r.rank_position,
                r.performance_category,
                pw.prize_position,
                sp.joined_at,
                sp.started_quiz_at,
                sp.submitted_at
            FROM session_participants sp
            JOIN quiz_sessions qs ON sp.session_id = qs.id
            JOIN quizzes q ON qs.quiz_id = q.id
            LEFT JOIN results r ON sp.session_id = r.session_id AND sp.participant_id = r.participant_id
            LEFT JOIN prize_winners pw ON sp.session_id = pw.session_id AND sp.participant_id = pw.participant_id
            WHERE sp.participant_id = $1
            ORDER BY qs.start_time DESC
        `, [participantId]);
        
        // Calculate overall statistics
        const completedSessions = sessionHistory.rows.filter(session => session.total_score !== null);
        const totalSessions = sessionHistory.rows.length;
        const avgScore = completedSessions.length > 0 
            ? completedSessions.reduce((sum, session) => sum + parseFloat(session.percentage_score), 0) / completedSessions.length 
            : 0;
        const avgTime = completedSessions.length > 0 
            ? completedSessions.reduce((sum, session) => sum + parseInt(session.completion_time_seconds), 0) / completedSessions.length 
            : 0;
        const prizeCount = sessionHistory.rows.filter(session => session.prize_position).length;
        const bestScore = completedSessions.length > 0 
            ? Math.max(...completedSessions.map(session => parseFloat(session.percentage_score))) 
            : 0;
        const bestRank = completedSessions.length > 0 
            ? Math.min(...completedSessions.map(session => parseInt(session.rank_position || 999))) 
            : null;
        
        // Performance trends (score over time)
        const performanceTrend = completedSessions.map(session => ({
            session_name: session.session_name,
            start_time: session.start_time,
            percentage_score: parseFloat(session.percentage_score),
            rank_position: parseInt(session.rank_position)
        })).reverse(); // Reverse to get chronological order
        
        res.json({
            success: true,
            data: {
                participant: participantInfo.rows[0],
                sessionHistory: sessionHistory.rows,
                statistics: {
                    total_sessions: totalSessions,
                    completed_sessions: completedSessions.length,
                    avg_score: Math.round(avgScore * 100) / 100,
                    avg_time_seconds: Math.round(avgTime),
                    prize_count: prizeCount,
                    best_score: Math.round(bestScore * 100) / 100,
                    best_rank: bestRank
                },
                performanceTrend
            }
        });
        
    } catch (error) {
        console.error('Get participant history error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load participant history'
        });
    }
});

// Get detailed question-by-question review for participant in a session
router.get('/participants/:participantId/session/:sessionId/questions', authorizeAdmin(), async (req, res) => {
    try {
        const { participantId, sessionId } = req.params;
        
        // Validate IDs
        if (!participantId || isNaN(parseInt(participantId)) || !sessionId || isNaN(parseInt(sessionId))) {
            return res.status(400).json({
                success: false,
                message: 'Invalid participant ID or session ID provided'
            });
        }
        
        const participantIdInt = parseInt(participantId);
        const sessionIdInt = parseInt(sessionId);
        
        // Get session and participant info
        const sessionInfo = await db.query(`
            SELECT 
                qs.session_name,
                q.title as quiz_title,
                q.total_questions,
                p.name as participant_name,
                r.total_score,
                r.percentage_score,
                r.completion_time_seconds
            FROM quiz_sessions qs
            JOIN quizzes q ON qs.quiz_id = q.id
            JOIN participants p ON p.id = $1
            LEFT JOIN results r ON r.session_id = qs.id AND r.participant_id = $1
            WHERE qs.id = $2
        `, [participantIdInt, sessionIdInt]);
        
        if (sessionInfo.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Session or participant not found'
            });
        }
        
        // Get all questions with participant answers
        const questionDetails = await db.query(`
            SELECT 
                q.id as question_id,
                q.question_text,
                q.option_a,
                q.option_b,
                q.option_c,
                q.option_d,
                q.correct_answer,
                q.question_order,
                pa.selected_answer,
                pa.is_correct,
                pa.answered_at,
                pa.time_taken_seconds,
                -- Overall question statistics
                COUNT(pa_all.id) as total_attempts,
                COUNT(CASE WHEN pa_all.is_correct = true THEN 1 END) as correct_count,
                ROUND(
                    (COUNT(CASE WHEN pa_all.is_correct = true THEN 1 END)::decimal / 
                     NULLIF(COUNT(pa_all.id), 0)) * 100, 2
                ) as success_rate
            FROM questions q
            JOIN quiz_sessions qs ON q.quiz_id = qs.quiz_id
            LEFT JOIN participant_answers pa ON q.id = pa.question_id 
                AND pa.session_id = $2 AND pa.participant_id = $1
            LEFT JOIN participant_answers pa_all ON q.id = pa_all.question_id 
                AND pa_all.session_id = $2
            WHERE qs.id = $2
            GROUP BY q.id, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, 
                     q.correct_answer, q.question_order, pa.selected_answer, pa.is_correct, 
                     pa.answered_at, pa.time_taken_seconds
            ORDER BY q.question_order
        `, [participantIdInt, sessionIdInt]);
        
        // Calculate question-wise statistics
        const questionStats = {
            total_questions: questionDetails.rows.length,
            answered: questionDetails.rows.filter(q => q.selected_answer).length,
            correct: questionDetails.rows.filter(q => q.is_correct === true).length,
            incorrect: questionDetails.rows.filter(q => q.is_correct === false).length,
            unanswered: questionDetails.rows.filter(q => q.selected_answer === null).length,
            avg_time_per_question: questionDetails.rows.filter(q => q.time_taken_seconds).length > 0
                ? Math.round(questionDetails.rows.filter(q => q.time_taken_seconds)
                    .reduce((sum, q) => sum + parseInt(q.time_taken_seconds || 0), 0) / 
                    questionDetails.rows.filter(q => q.time_taken_seconds).length)
                : 0
        };
        
        res.json({
            success: true,
            data: {
                session: sessionInfo.rows[0],
                questions: questionDetails.rows,
                statistics: questionStats
            }
        });
        
    } catch (error) {
        console.error('Get participant question details error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load participant question details'
        });
    }
});

module.exports = router;