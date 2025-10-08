// Optional notification dependencies - only load if available and configured
let nodemailer = null;
let twilio = null;

// Try to load nodemailer if configured and available
if (process.env.EMAIL_HOST) {
    try {
        nodemailer = require('nodemailer');
    } catch (error) {
        console.log('📧 Email notifications not available (nodemailer not installed)');
        console.log('   To enable email: npm install nodemailer');
    }
}

// Try to load twilio if configured and available
if (process.env.TWILIO_ACCOUNT_SID) {
    try {
        twilio = require('twilio');
    } catch (error) {
        console.log('📱 SMS notifications not available (twilio not installed)');
        console.log('   To enable SMS: npm install twilio');
    }
}
require('dotenv').config();

class NotificationService {
    constructor() {
        this.emailTransporter = null;
        this.twilioClient = null;
        
        // Initialize email transporter only if nodemailer is available and configured
        if (nodemailer && process.env.EMAIL_HOST && process.env.EMAIL_USER) {
            try {
                this.emailTransporter = nodemailer.createTransporter({
                    host: process.env.EMAIL_HOST,
                    port: process.env.EMAIL_PORT,
                    secure: false, // true for 465, false for other ports
                    auth: {
                        user: process.env.EMAIL_USER,
                        pass: process.env.EMAIL_PASSWORD
                    }
                });
                console.log('✅ Email service initialized');
            } catch (error) {
                console.log('❌ Failed to initialize email service:', error.message);
            }
        }
        
        // Initialize Twilio client only if twilio is available and configured
        if (twilio && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
            try {
                this.twilioClient = twilio(
                    process.env.TWILIO_ACCOUNT_SID,
                    process.env.TWILIO_AUTH_TOKEN
                );
                console.log('✅ SMS service initialized');
            } catch (error) {
                console.log('❌ Failed to initialize SMS service:', error.message);
            }
        }
        
        // Log status
        if (!this.emailTransporter && !this.twilioClient) {
            console.log('ℹ️  No notification services configured - using manual credential distribution');
        }
    }
    
    // Send credentials via email
    async sendCredentialsEmail(email, name, username, password) {
        try {
            if (!this.emailTransporter) {
                throw new Error('Email service not configured');
            }
            
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: 'Quiz Competition - Login Credentials',
                html: this.getCredentialsEmailTemplate(name, username, password)
            };
            
            const info = await this.emailTransporter.sendMail(mailOptions);
            console.log(`Credentials email sent to ${email}: ${info.messageId}`);
            
            return {
                success: true,
                messageId: info.messageId
            };
            
        } catch (error) {
            console.error('Send credentials email error:', error);
            throw error;
        }
    }
    
    // Send credentials via SMS
    async sendCredentialsSMS(mobile, name, username, password) {
        try {
            if (!this.twilioClient) {
                throw new Error('SMS service not configured');
            }
            
            const message = this.getCredentialsSMSTemplate(name, username, password);
            
            const result = await this.twilioClient.messages.create({
                body: message,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: mobile
            });
            
            console.log(`Credentials SMS sent to ${mobile}: ${result.sid}`);
            
            return {
                success: true,
                messageSid: result.sid
            };
            
        } catch (error) {
            console.error('Send credentials SMS error:', error);
            throw error;
        }
    }
    
    // Send quiz reminder email
    async sendQuizReminderEmail(email, name, quizTitle, startTime) {
        try {
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: `Quiz Reminder - ${quizTitle}`,
                html: this.getQuizReminderEmailTemplate(name, quizTitle, startTime)
            };
            
            const info = await this.emailTransporter.sendMail(mailOptions);
            console.log(`Quiz reminder email sent to ${email}: ${info.messageId}`);
            
            return {
                success: true,
                messageId: info.messageId
            };
            
        } catch (error) {
            console.error('Send quiz reminder email error:', error);
            throw error;
        }
    }
    
    // Send quiz results email
    async sendQuizResultsEmail(email, name, resultsData) {
        try {
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: 'Quiz Competition - Your Results',
                html: this.getQuizResultsEmailTemplate(name, resultsData)
            };
            
            const info = await this.emailTransporter.sendMail(mailOptions);
            console.log(`Quiz results email sent to ${email}: ${info.messageId}`);
            
            return {
                success: true,
                messageId: info.messageId
            };
            
        } catch (error) {
            console.error('Send quiz results email error:', error);
            throw error;
        }
    }
    
    // Send bulk notifications
    async sendBulkEmails(recipients, subject, htmlTemplate) {
        const results = {
            sent: [],
            failed: []
        };
        
        for (const recipient of recipients) {
            try {
                const mailOptions = {
                    from: process.env.EMAIL_USER,
                    to: recipient.email,
                    subject: subject,
                    html: htmlTemplate(recipient)
                };
                
                const info = await this.emailTransporter.sendMail(mailOptions);
                results.sent.push({
                    email: recipient.email,
                    messageId: info.messageId
                });
                
                // Add delay to avoid rate limiting
                await this.delay(100);
                
            } catch (error) {
                console.error(`Failed to send email to ${recipient.email}:`, error);
                results.failed.push({
                    email: recipient.email,
                    error: error.message
                });
            }
        }
        
        return results;
    }
    
    // Email templates
    getCredentialsEmailTemplate(name, username, password) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
                    .content { background-color: #f9f9f9; padding: 20px; }
                    .credentials { background-color: white; padding: 15px; border-left: 4px solid #4CAF50; margin: 20px 0; }
                    .warning { background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; margin: 20px 0; }
                    .footer { text-align: center; padding: 20px; color: #666; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Quiz Competition Login Credentials</h1>
                    </div>
                    
                    <div class="content">
                        <p>Dear ${name},</p>
                        
                        <p>Welcome to the HR & Labour Law Compliance Quiz Competition! Your login credentials have been generated successfully.</p>
                        
                        <div class="credentials">
                            <h3>Your Login Credentials:</h3>
                            <p><strong>Username:</strong> ${username}</p>
                            <p><strong>Password:</strong> ${password}</p>
                        </div>
                        
                        <div class="warning">
                            <h4>Important Instructions:</h4>
                            <ul>
                                <li>Quiz starts at <strong>04:00 AM</strong></li>
                                <li>5 minutes reading time before the actual quiz begins</li>
                                <li>15 minutes quiz duration</li>
                                <li>Questions appear one at a time</li>
                                <li>You can skip questions and return to them later</li>
                                <li>Quiz auto-submits when time expires</li>
                                <li>First and Second prize winners will be announced after completion</li>
                            </ul>
                        </div>
                        
                        <p><strong>Keep your credentials secure and do not share them with anyone.</strong></p>
                        
                        <p>Good luck with your quiz!</p>
                    </div>
                    
                    <div class="footer">
                        <p>Quiz Competition System<br>
                        This is an automated message. Please do not reply to this email.</p>
                    </div>
                </div>
            </body>
            </html>
        `;
    }
    
    getCredentialsSMSTemplate(name, username, password) {
        return `Hi ${name}, Your quiz login credentials: Username: ${username}, Password: ${password}. Quiz starts at 04:00 AM. Good luck!`;
    }
    
    getQuizReminderEmailTemplate(name, quizTitle, startTime) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background-color: #FF9800; color: white; padding: 20px; text-align: center; }
                    .content { background-color: #f9f9f9; padding: 20px; }
                    .reminder { background-color: white; padding: 15px; border-left: 4px solid #FF9800; margin: 20px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Quiz Reminder</h1>
                    </div>
                    
                    <div class="content">
                        <p>Dear ${name},</p>
                        
                        <div class="reminder">
                            <h3>Quiz Starting Soon!</h3>
                            <p><strong>Quiz:</strong> ${quizTitle}</p>
                            <p><strong>Start Time:</strong> ${startTime}</p>
                            <p>Please log in using your credentials and be ready!</p>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `;
    }
    
    getQuizResultsEmailTemplate(name, resultsData) {
        const { totalQuestions, correctAnswers, incorrectAnswers, unanswered, percentageScore, performanceCategory } = resultsData;
        
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background-color: #2196F3; color: white; padding: 20px; text-align: center; }
                    .content { background-color: #f9f9f9; padding: 20px; }
                    .results { background-color: white; padding: 15px; border-left: 4px solid #2196F3; margin: 20px 0; }
                    .score { font-size: 24px; font-weight: bold; color: #4CAF50; text-align: center; margin: 20px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Quiz Results</h1>
                    </div>
                    
                    <div class="content">
                        <p>Dear ${name},</p>
                        
                        <p>Thank you for participating in the HR & Labour Law Compliance Quiz Competition!</p>
                        
                        <div class="score">
                            Your Score: ${percentageScore.toFixed(1)}%
                        </div>
                        
                        <div class="results">
                            <h3>Detailed Results:</h3>
                            <p><strong>Total Questions:</strong> ${totalQuestions}</p>
                            <p><strong>Correct Answers:</strong> ${correctAnswers}</p>
                            <p><strong>Incorrect Answers:</strong> ${incorrectAnswers}</p>
                            <p><strong>Unanswered:</strong> ${unanswered}</p>
                            <p><strong>Performance Category:</strong> ${performanceCategory}</p>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `;
    }
    
    // Utility function to add delay
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    // Test email configuration
    async testEmailConfiguration() {
        try {
            if (!this.emailTransporter) {
                console.log('📧 Email service not configured');
                return false;
            }
            
            await this.emailTransporter.verify();
            console.log('✅ Email configuration is working');
            return true;
        } catch (error) {
            console.error('❌ Email configuration error:', error);
            return false;
        }
    }
    
    // Check if services are available
    isEmailAvailable() {
        return !!this.emailTransporter;
    }
    
    isSMSAvailable() {
        return !!this.twilioClient;
    }
}

module.exports = new NotificationService();