const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const notificationService = require('./notificationService');

class ParticipantService {
    
    // Clean mobile number - remove +91, spaces, and ensure 10 digits
    cleanMobileNumber(mobile) {
        if (!mobile) return '';
        
        // Remove all non-digit characters
        let cleaned = mobile.replace(/\D/g, '');
        
        // Remove country code +91 if present
        if (cleaned.startsWith('91') && cleaned.length === 12) {
            cleaned = cleaned.substring(2);
        }
        
        // Ensure it's exactly 10 digits
        if (cleaned.length === 10) {
            return cleaned;
        }
        
        throw new Error(`Invalid mobile number: ${mobile}. Must be 10 digits.`);
    }
    
    // Generate username from email (use email as username)
    generateUsername(email) {
        return email.toLowerCase().trim();
    }
    
    // Generate password from mobile number
    generatePassword(mobile) {
        return this.cleanMobileNumber(mobile);
    }
    
    // Helper function to parse CSV line handling quoted fields
    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current.trim());
        return result;
    }
    
    // Parse Excel/CSV data
    async parseParticipantData(data, fileType) {
        const participants = [];
        
        try {
            if (fileType === 'csv') {
                // Parse CSV data
                const lines = data.split('\n');
                const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
                
                // Find column indices for exact field mapping
                const nameIndex = headers.findIndex(h => h === 'name');
                const emailIndex = headers.findIndex(h => h === 'email');
                const companyIndex = headers.findIndex(h => h === 'company');
                const designationIndex = headers.findIndex(h => h === 'designation');
                const mobileIndex = headers.findIndex(h => h === 'mobile');
                
                // Validate required columns exist
                if (nameIndex === -1 || emailIndex === -1 || companyIndex === -1 || designationIndex === -1 || mobileIndex === -1) {
                    throw new Error('CSV must contain columns: Name, Email, Company, Designation, Mobile');
                }
                
                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;
                    
                    // Parse CSV line properly handling quoted fields
                    const fields = this.parseCSVLine(line);
                    
                    try {
                        const participant = {
                            name: fields[nameIndex]?.trim() || '',
                            email: fields[emailIndex]?.trim() || '',
                            company: fields[companyIndex]?.trim() || '',
                            designation: fields[designationIndex]?.trim() || '',
                            mobile: fields[mobileIndex]?.trim() || ''
                        };
                        
                        // Validate required fields
                        if (!participant.name || !participant.email || !participant.mobile) {
                            console.warn(`Skipping row ${i}: Missing required fields (Name, Email, Mobile)`);
                            continue;
                        }
                        
                        // Validate and clean mobile number
                        participant.mobile = this.cleanMobileNumber(participant.mobile);
                        
                        participants.push(participant);
                    } catch (error) {
                        console.warn(`Skipping row ${i}: ${error.message}`);
                    }
                }
            } else {
                // Handle Excel data (assuming it's already parsed)
                for (const row of data) {
                    try {
                        const participant = {
                            name: row.Name || row.name || '',
                            email: row.Email || row.email || '',
                            company: row.Company || row.company || '',
                            designation: row.Designation || row.designation || '',
                            mobile: row.Mobile || row.mobile || ''
                        };
                        
                        // Validate required fields
                        if (!participant.name || !participant.email || !participant.mobile) {
                            console.warn(`Skipping Excel row: Missing required fields (Name, Email, Mobile)`);
                            continue;
                        }
                        
                        // Validate and clean mobile number
                        participant.mobile = this.cleanMobileNumber(participant.mobile);
                        
                        participants.push(participant);
                    } catch (error) {
                        console.warn(`Skipping Excel row: ${error.message}`);
                    }
                }
            }
            
            return participants;
            
        } catch (error) {
            console.error('Parse participant data error:', error);
            throw new Error('Failed to parse participant data');
        }
    }
    
    // Bulk upload participants with credential generation
    async bulkUploadParticipants(participantsData, sessionId = null) {
        const client = await db.getClient();
        const results = {
            success: [],
            errors: [],
            credentials: []
        };
        
        try {
            // Process each participant in its own transaction to avoid transaction abortion issues
            for (const participantData of participantsData) {
                try {
                    await client.query('BEGIN');
                    
                    const { name, email, designation, mobile, company } = participantData;
                    
                    // Validate required fields
                    if (!name || !email) {
                        await client.query('ROLLBACK');
                        results.errors.push({
                            participant: participantData,
                            error: 'Name and email are required'
                        });
                        continue;
                    }
                    
                    // Check if participant already exists
                    const existingResult = await client.query(
                        'SELECT id FROM participants WHERE email = $1',
                        [email]
                    );
                    
                    let participantId;
                    
                    if (existingResult.rows.length > 0) {
                        // Update existing participant
                        participantId = existingResult.rows[0].id;
                        await client.query(`
                            UPDATE participants 
                            SET name = $1, designation = $2, mobile = $3, company = $4, updated_at = CURRENT_TIMESTAMP
                            WHERE id = $5
                        `, [name, designation, mobile, company, participantId]);
                    } else {
                        // Insert new participant
                        const insertResult = await client.query(`
                            INSERT INTO participants (name, email, designation, mobile, company)
                            VALUES ($1, $2, $3, $4, $5)
                            RETURNING id
                        `, [name, email, designation, mobile, company]);
                        
                        participantId = insertResult.rows[0].id;
                    }
                    
                    // Generate credentials
                    const credentials = await this.generateCredentials(client, participantId, name, email, mobile);
                    
                    // Add to session if sessionId provided
                    if (sessionId) {
                        await client.query(`
                            INSERT INTO session_participants (session_id, participant_id)
                            VALUES ($1, $2)
                            ON CONFLICT (session_id, participant_id) DO NOTHING
                        `, [sessionId, participantId]);
                    }
                    
                    // Commit individual participant transaction
                    await client.query('COMMIT');
                    
                    results.success.push({
                        id: participantId,
                        name,
                        email,
                        credentials
                    });
                    
                    results.credentials.push({
                        participantId,
                        name,
                        email,
                        username: credentials.username,
                        password: credentials.password
                    });
                    
                } catch (error) {
                    console.error(`Error processing participant ${participantData.email}:`, error);
                    
                    // Always rollback the individual transaction on error
                    try {
                        await client.query('ROLLBACK');
                    } catch (rollbackError) {
                        console.error('Error rolling back transaction:', rollbackError);
                    }
                    
                    results.errors.push({
                        participant: participantData,
                        error: error.message
                    });
                    
                    // Continue processing other participants
                    continue;
                }
            }
            
            return results;
            
        } catch (error) {
            // No longer using a single transaction, so no need to rollback here
            console.error('Bulk upload participants error:', error);
            throw error;
        } finally {
            client.release();
        }
    }
    
    // Generate credentials for a participant
    async generateCredentials(client, participantId, name, email, mobile) {
        try {
            // Check if credentials already exist
            const existingCreds = await client.query(
                'SELECT username, id FROM user_credentials WHERE participant_id = $1',
                [participantId]
            );
            
            let username, password, passwordHash;
            
            // Use email as username and cleaned mobile as password
            username = this.generateUsername(email);
            password = this.generatePassword(mobile);
            passwordHash = await bcrypt.hash(password, 10);
            
            if (existingCreds.rows.length > 0) {
                // Check if username needs to be updated and if it's available
                const currentUsername = existingCreds.rows[0].username;
                if (currentUsername !== username) {
                    // Check if the new username is available
                    const usernameCheck = await client.query(
                        'SELECT id FROM user_credentials WHERE username = $1 AND participant_id != $2',
                        [username, participantId]
                    );
                    
                    if (usernameCheck.rows.length > 0) {
                        // Username conflict - use existing username instead of updating
                        console.log(`Username conflict for ${email}, keeping existing username: ${currentUsername}`);
                        username = currentUsername;
                    }
                }
                
                // Update existing credentials
                await client.query(
                    'UPDATE user_credentials SET username = $1, password_hash = $2, is_active = true WHERE participant_id = $3',
                    [username, passwordHash, participantId]
                );
            } else {
                // Check if username is available before inserting
                const usernameCheck = await client.query(
                    'SELECT id FROM user_credentials WHERE username = $1',
                    [username]
                );
                
                if (usernameCheck.rows.length > 0) {
                    // Username taken - generate a unique one
                    let counter = 1;
                    let uniqueUsername = username;
                    while (true) {
                        uniqueUsername = `${username}.${counter}`;
                        const uniqueCheck = await client.query(
                            'SELECT id FROM user_credentials WHERE username = $1',
                            [uniqueUsername]
                        );
                        if (uniqueCheck.rows.length === 0) {
                            break;
                        }
                        counter++;
                    }
                    username = uniqueUsername;
                    console.log(`Username conflict resolved, using: ${username}`);
                }
                
                // Generate new credentials
                await client.query(`
                    INSERT INTO user_credentials (participant_id, username, password_hash, is_active)
                    VALUES ($1, $2, $3, true)
                `, [participantId, username, passwordHash]);
            }
            
            return { username, password };
            
        } catch (error) {
            console.error('Generate credentials error:', error);
            throw error;
        }
    }
    
    
    // Send credentials to participants
    async sendCredentials(credentialsList, method = 'email') {
        const results = {
            sent: [],
            failed: []
        };
        
        // Check if notification service is available
        if (method === 'email' && !notificationService.isEmailAvailable()) {
            return {
                sent: [],
                failed: credentialsList.map(cred => ({
                    credentials: cred,
                    error: 'Email service not configured. Please set up EMAIL_HOST in environment variables.'
                }))
            };
        }
        
        if (method === 'sms' && !notificationService.isSMSAvailable()) {
            return {
                sent: [],
                failed: credentialsList.map(cred => ({
                    credentials: cred,
                    error: 'SMS service not configured. Please set up Twilio credentials in environment variables.'
                }))
            };
        }
        
        for (const credentials of credentialsList) {
            try {
                if (method === 'email') {
                    await notificationService.sendCredentialsEmail(
                        credentials.email,
                        credentials.name,
                        credentials.username,
                        credentials.password
                    );
                } else if (method === 'sms') {
                    // Get mobile number from database
                    const result = await db.query(
                        'SELECT mobile FROM participants WHERE id = $1',
                        [credentials.participantId]
                    );
                    
                    if (result.rows.length > 0 && result.rows[0].mobile) {
                        await notificationService.sendCredentialsSMS(
                            result.rows[0].mobile,
                            credentials.name,
                            credentials.username,
                            credentials.password
                        );
                    } else {
                        throw new Error('Mobile number not available');
                    }
                }
                
                results.sent.push(credentials);
                
            } catch (error) {
                console.error(`Failed to send credentials to ${credentials.email}:`, error);
                results.failed.push({
                    credentials,
                    error: error.message
                });
            }
        }
        
        return results;
    }
    
    // Get credentials for manual distribution
    async getCredentialsForDisplay(participantIds) {
        try {
            const results = [];
            
            for (const participantId of participantIds) {
                const participantResult = await db.query(`
                    SELECT p.id, p.name, p.email, p.designation, p.company, p.mobile, uc.username
                    FROM participants p
                    JOIN user_credentials uc ON p.id = uc.participant_id
                    WHERE p.id = $1 AND uc.is_active = true
                `, [participantId]);
                
                if (participantResult.rows.length > 0) {
                    const participant = participantResult.rows[0];
                    
                    // Since password is mobile number, we can regenerate it
                    const password = this.generatePassword(participant.mobile);
                    const bcrypt = require('bcryptjs');
                    const passwordHash = await bcrypt.hash(password, 10);
                    
                    // Update the password in database to ensure consistency
                    await db.query(
                        'UPDATE user_credentials SET password_hash = $1 WHERE participant_id = $2',
                        [passwordHash, participantId]
                    );
                    
                    results.push({
                        id: participant.id,
                        name: participant.name,
                        email: participant.email,
                        designation: participant.designation,
                        company: participant.company,
                        username: participant.username, // This is the email
                        password: password // This is the cleaned mobile number
                    });
                }
            }
            
            return results;
            
        } catch (error) {
            console.error('Get credentials for display error:', error);
            throw error;
        }
    }
    
    // Get participant list for a session
    async getSessionParticipants(sessionId) {
        try {
            const result = await db.query(`
                SELECT p.*, uc.username, sp.joined_at, sp.status
                FROM session_participants sp
                JOIN participants p ON sp.participant_id = p.id
                LEFT JOIN user_credentials uc ON p.id = uc.participant_id
                WHERE sp.session_id = $1
                ORDER BY sp.joined_at ASC
            `, [sessionId]);
            
            return result.rows;
            
        } catch (error) {
            console.error('Get session participants error:', error);
            throw error;
        }
    }
    
    // Deactivate participant credentials
    async deactivateParticipant(participantId) {
        try {
            await db.query(
                'UPDATE user_credentials SET is_active = false WHERE participant_id = $1',
                [participantId]
            );
            
            return true;
            
        } catch (error) {
            console.error('Deactivate participant error:', error);
            throw error;
        }
    }
    
    // Reactivate participant credentials
    async reactivateParticipant(participantId) {
        try {
            await db.query(
                'UPDATE user_credentials SET is_active = true WHERE participant_id = $1',
                [participantId]
            );
            
            return true;
            
        } catch (error) {
            console.error('Reactivate participant error:', error);
            throw error;
        }
    }
    
    // Reset participant password
    async resetParticipantPassword(participantId) {
        try {
            // Get participant's mobile number
            const participantResult = await db.query(
                'SELECT mobile FROM participants WHERE id = $1',
                [participantId]
            );
            
            if (participantResult.rows.length === 0) {
                throw new Error('Participant not found');
            }
            
            const mobile = participantResult.rows[0].mobile;
            
            // Generate new password from mobile number
            const newPassword = this.generatePassword(mobile);
            const passwordHash = await bcrypt.hash(newPassword, 10);
            
            // Update password in database
            await db.query(
                'UPDATE user_credentials SET password_hash = $1 WHERE participant_id = $2',
                [passwordHash, participantId]
            );
            
            return {
                success: true,
                newPassword: newPassword
            };
            
        } catch (error) {
            console.error('Reset participant password error:', error);
            throw error;
        }
    }
}

module.exports = new ParticipantService();