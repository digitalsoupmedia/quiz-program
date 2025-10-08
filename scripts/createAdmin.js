#!/usr/bin/env node

const bcrypt = require('bcryptjs');
const readline = require('readline');
const db = require('../config/database');
require('dotenv').config();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

function questionHidden(prompt) {
    return new Promise((resolve) => {
        process.stdout.write(prompt);
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        
        let password = '';
        process.stdin.on('data', function(char) {
            char = char + "";
            
            switch(char) {
                case "\n":
                case "\r":
                case "\u0004":
                    process.stdin.setRawMode(false);
                    process.stdin.pause();
                    process.stdout.write('\n');
                    resolve(password);
                    break;
                case "\u0003":
                    process.exit();
                    break;
                case "\u007f": // Backspace
                    if (password.length > 0) {
                        password = password.slice(0, -1);
                        process.stdout.write('\b \b');
                    }
                    break;
                default:
                    password += char;
                    process.stdout.write('*');
                    break;
            }
        });
    });
}

async function validateInput(username, email, password) {
    const errors = [];
    
    // Username validation
    if (!username || username.length < 3) {
        errors.push('Username must be at least 3 characters long');
    }
    
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        errors.push('Username can only contain letters, numbers, and underscores');
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        errors.push('Please enter a valid email address');
    }
    
    // Password validation
    if (!password || password.length < 6) {
        errors.push('Password must be at least 6 characters long');
    }
    
    return errors;
}

async function checkExistingAdmin(username, email) {
    try {
        const result = await db.query(
            'SELECT id, username, email FROM admin_users WHERE username = $1 OR email = $2',
            [username, email]
        );
        
        return result.rows;
    } catch (error) {
        console.error('Error checking existing admin:', error);
        throw error;
    }
}

async function createAdminUser(username, email, password, role = 'admin') {
    try {
        const passwordHash = await bcrypt.hash(password, 10);
        
        const result = await db.query(`
            INSERT INTO admin_users (username, email, password_hash, role, is_active)
            VALUES ($1, $2, $3, $4, true)
            RETURNING id, username, email, role, created_at
        `, [username, email, passwordHash, role]);
        
        return result.rows[0];
    } catch (error) {
        console.error('Error creating admin user:', error);
        throw error;
    }
}

async function listAdminUsers() {
    try {
        const result = await db.query(`
            SELECT id, username, email, role, is_active, created_at, last_login
            FROM admin_users
            ORDER BY created_at DESC
        `);
        
        return result.rows;
    } catch (error) {
        console.error('Error listing admin users:', error);
        throw error;
    }
}

async function updateAdminUser(adminId, updates) {
    try {
        const setClause = [];
        const values = [];
        let paramCount = 1;
        
        if (updates.password) {
            const passwordHash = await bcrypt.hash(updates.password, 10);
            setClause.push(`password_hash = $${paramCount++}`);
            values.push(passwordHash);
        }
        
        if (updates.email) {
            setClause.push(`email = $${paramCount++}`);
            values.push(updates.email);
        }
        
        if (updates.role) {
            setClause.push(`role = $${paramCount++}`);
            values.push(updates.role);
        }
        
        if (updates.is_active !== undefined) {
            setClause.push(`is_active = $${paramCount++}`);
            values.push(updates.is_active);
        }
        
        setClause.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(adminId);
        
        const result = await db.query(`
            UPDATE admin_users 
            SET ${setClause.join(', ')}
            WHERE id = $${paramCount}
            RETURNING id, username, email, role, is_active
        `, values);
        
        return result.rows[0];
    } catch (error) {
        console.error('Error updating admin user:', error);
        throw error;
    }
}

async function createAdminWizard() {
    console.log('\n🔧 Quiz Competition - Admin User Creator\n');
    
    try {
        // Get user input
        const username = await question('Enter username: ');
        const email = await question('Enter email: ');
        const password = await questionHidden('Enter password: ');
        const confirmPassword = await questionHidden('Confirm password: ');
        
        // Validate passwords match
        if (password !== confirmPassword) {
            console.log('❌ Passwords do not match!');
            rl.close();
            process.exit(1);
        }
        
        // Validate input
        const errors = await validateInput(username, email, password);
        if (errors.length > 0) {
            console.log('\n❌ Validation errors:');
            errors.forEach(error => console.log(`  - ${error}`));
            rl.close();
            process.exit(1);
        }
        
        // Check for existing admin
        const existing = await checkExistingAdmin(username, email);
        if (existing.length > 0) {
            console.log('\n❌ Admin user already exists with this username or email:');
            existing.forEach(admin => {
                console.log(`  - ID: ${admin.id}, Username: ${admin.username}, Email: ${admin.email}`);
            });
            rl.close();
            process.exit(1);
        }
        
        // Ask for role
        const roleInput = await question('Enter role (admin/super_admin) [admin]: ');
        const role = roleInput.toLowerCase() === 'super_admin' ? 'super_admin' : 'admin';
        
        // Create admin user
        console.log('\n🔄 Creating admin user...');
        const newAdmin = await createAdminUser(username, email, password, role);
        
        console.log('\n✅ Admin user created successfully!');
        console.log('📋 Details:');
        console.log(`  - ID: ${newAdmin.id}`);
        console.log(`  - Username: ${newAdmin.username}`);
        console.log(`  - Email: ${newAdmin.email}`);
        console.log(`  - Role: ${newAdmin.role}`);
        console.log(`  - Created: ${newAdmin.created_at}`);
        
    } catch (error) {
        console.error('\n❌ Failed to create admin user:', error.message);
        process.exit(1);
    } finally {
        rl.close();
        await db.end();
    }
}

async function listAdminsCommand() {
    console.log('\n📋 Current Admin Users:\n');
    
    try {
        const admins = await listAdminUsers();
        
        if (admins.length === 0) {
            console.log('No admin users found.');
        } else {
            console.log('ID\tUsername\t\tEmail\t\t\tRole\t\tActive\tCreated');
            console.log('─'.repeat(80));
            
            admins.forEach(admin => {
                const activeStatus = admin.is_active ? '✅' : '❌';
                const lastLogin = admin.last_login ? new Date(admin.last_login).toLocaleDateString() : 'Never';
                console.log(`${admin.id}\t${admin.username.padEnd(15)}\t${admin.email.padEnd(20)}\t${admin.role.padEnd(10)}\t${activeStatus}\t${new Date(admin.created_at).toLocaleDateString()}`);
            });
        }
        
    } catch (error) {
        console.error('❌ Failed to list admin users:', error.message);
        process.exit(1);
    } finally {
        await db.end();
    }
}

async function deactivateAdminCommand(adminId) {
    try {
        const updated = await updateAdminUser(adminId, { is_active: false });
        console.log(`✅ Admin user ${updated.username} has been deactivated.`);
    } catch (error) {
        console.error('❌ Failed to deactivate admin user:', error.message);
        process.exit(1);
    } finally {
        await db.end();
    }
}

async function activateAdminCommand(adminId) {
    try {
        const updated = await updateAdminUser(adminId, { is_active: true });
        console.log(`✅ Admin user ${updated.username} has been activated.`);
    } catch (error) {
        console.error('❌ Failed to activate admin user:', error.message);
        process.exit(1);
    } finally {
        await db.end();
    }
}

// Command line interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    switch (command) {
        case 'create':
        case 'add':
            await createAdminWizard();
            break;
            
        case 'list':
        case 'ls':
            await listAdminsCommand();
            break;
            
        case 'deactivate':
        case 'disable':
            if (!args[1]) {
                console.log('❌ Please provide admin ID: npm run create-admin deactivate <id>');
                process.exit(1);
            }
            await deactivateAdminCommand(parseInt(args[1]));
            break;
            
        case 'activate':
        case 'enable':
            if (!args[1]) {
                console.log('❌ Please provide admin ID: npm run create-admin activate <id>');
                process.exit(1);
            }
            await activateAdminCommand(parseInt(args[1]));
            break;
            
        case 'help':
        case '--help':
        case '-h':
            console.log(`
🔧 Quiz Competition - Admin User Management

Usage:
  npm run create-admin <command> [options]

Commands:
  create, add           Create a new admin user (interactive)
  list, ls             List all admin users
  activate <id>        Activate an admin user
  deactivate <id>      Deactivate an admin user
  help                 Show this help message

Examples:
  npm run create-admin create
  npm run create-admin list
  npm run create-admin deactivate 1
  npm run create-admin activate 1
            `);
            break;
            
        default:
            console.log('❌ Unknown command. Use "npm run create-admin help" for available commands.');
            await createAdminWizard(); // Default to create wizard
            break;
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    createAdminUser,
    listAdminUsers,
    updateAdminUser,
    checkExistingAdmin
};