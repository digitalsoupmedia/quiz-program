const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
});

async function seedDatabase() {
    const client = await pool.connect();
    
    try {
        console.log('🌱 Starting database seeding...');
        
        // Create sample quiz
        const quizResult = await client.query(`
            INSERT INTO quizzes (title, description, start_date, total_questions, is_active)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
        `, [
            'HR & Labour Law Compliance Quiz',
            'Test your knowledge of EPF, ESI, POSH Act, and other labour law compliance requirements',
            '2024-01-01',
            20,
            true
        ]);
        
        const quizId = quizResult.rows[0].id;
        console.log(`✅ Created quiz with ID: ${quizId}`);
        
        // Create sample questions directly
        const questions = getSampleQuestions();
        
        // Insert questions
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            await client.query(`
                INSERT INTO questions (quiz_id, question_text, option_a, option_b, option_c, option_d, correct_answer, question_order)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [quizId, q.question, q.options.a, q.options.b, q.options.c, q.options.d, q.correct, i + 1]);
        }
        
        console.log(`✅ Inserted ${questions.length} questions`);
        
        // Create sample quiz session
        const sessionResult = await client.query(`
            INSERT INTO quiz_sessions (quiz_id, session_name, start_time, status)
            VALUES ($1, $2, $3, $4)
            RETURNING id
        `, [
            quizId,
            'Sample Quiz Session',
            new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
            'scheduled'
        ]);
        
        const sessionId = sessionResult.rows[0].id;
        console.log(`✅ Created quiz session with ID: ${sessionId}`);
        
        // Create sample participants
        const participants = getSampleParticipants();
        const bcrypt = require('bcryptjs');
        
        for (const participant of participants) {
            // Insert participant (or get existing)
            let participantResult = await client.query(`
                INSERT INTO participants (name, email, designation, mobile, company)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (email) DO UPDATE SET
                    name = EXCLUDED.name,
                    designation = EXCLUDED.designation,
                    mobile = EXCLUDED.mobile,
                    company = EXCLUDED.company
                RETURNING id
            `, [participant.name, participant.email, participant.designation, participant.mobile, participant.company]);
            
            const participantId = participantResult.rows[0].id;
            
            // Generate credentials (check if exists first)
            const existingCreds = await client.query(
                'SELECT id FROM user_credentials WHERE participant_id = $1',
                [participantId]
            );
            
            if (existingCreds.rows.length === 0) {
                const username = participant.name.toLowerCase().replace(/\s+/g, '') + Math.floor(Math.random() * 100);
                const password = 'quiz123';
                const passwordHash = await bcrypt.hash(password, 10);
                
                await client.query(`
                    INSERT INTO user_credentials (participant_id, username, password_hash, is_active)
                    VALUES ($1, $2, $3, true)
                `, [participantId, username, passwordHash]);
            }
            
            // Add to session (if not already added)
            await client.query(`
                INSERT INTO session_participants (session_id, participant_id, status)
                VALUES ($1, $2, 'joined')
                ON CONFLICT (session_id, participant_id) DO NOTHING
            `, [sessionId, participantId]);
        }
        
        console.log(`✅ Created ${participants.length} sample participants`);
        console.log('🎉 Database seeding completed successfully!');
        
    } catch (error) {
        console.error('❌ Seeding failed:', error.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

function getSampleQuestions() {
    return [
        {
            question: "Which one of the following is not coming under EPF?",
            options: { a: "UAN", b: "PPO", c: "EPS", d: "None of these" },
            correct: "d"
        },
        {
            question: "How many Festival Holidays to be included in the List of Holidays to be submitted to the Labour officer for his approval under N&FH Act?",
            options: { a: "13", b: "9", c: "12", d: "4" },
            correct: "b"
        },
        {
            question: "In ESIC what is the time limit to register a newly joined employee?",
            options: { a: "10 days", b: "21 days", c: "30 days", d: "No Limit" },
            correct: "a"
        },
        {
            question: "In which year the POSH Act was implemented?",
            options: { a: "1948", b: "2001", c: "1995", d: "2013" },
            correct: "d"
        },
        {
            question: "What is the time limit to disburse the Bonus after the closing of a financial year?",
            options: { a: "6 Months", b: "8 Months", c: "1 Month", d: "Any time" },
            correct: "b"
        },
        {
            question: "The ESI scheme covers employees earning wages up to:",
            options: { a: "₹15,000 per month", b: "₹21,000 per month", c: "₹25,000 per month", d: "₹30,000 per month" },
            correct: "b"
        },
        {
            question: "Maternity benefit under ESI Act is payable for:",
            options: { a: "12 weeks", b: "16 weeks", c: "20 weeks", d: "26 weeks" },
            correct: "d"
        },
        {
            question: "The EPF Act is applicable to establishments employing how many persons or more?",
            options: { a: "10 or more", b: "15 or more", c: "20 or more", d: "25 or more" },
            correct: "c"
        },
        {
            question: "The Payment of Bonus Act is applicable to establishments employing how many persons or more in the state of Kerala?",
            options: { a: "10", b: "20", c: "25", d: "15" },
            correct: "a"
        },
        {
            question: "What is the employer's total contribution rate(including administrative charges) under EPF Act?",
            options: { a: "12% of basic wages", b: "13% of basic wages", c: "15% of basic wages", d: "16.61% of basic wages" },
            correct: "a"
        },
        {
            question: "What are the components of wages which will attract Bonus under Payment of Bonus Act?",
            options: { a: "DA and allowances", b: "All allowances", c: "Basic", d: "Basic and DA" },
            correct: "d"
        },
        {
            question: "What is the official web site of Kerala Labour Department?",
            options: { a: "lwfkerala.gov.in", b: "peedika.kerala.gov.in", c: "lc.kerala.gov.in", d: "labour.kerala.gov.in" },
            correct: "d"
        },
        {
            question: "The Payment Bonus Act implemented in which year?",
            options: { a: "1965", b: "1972", c: "1947", d: "None of these" },
            correct: "a"
        },
        {
            question: "The minimum service required for pension eligibility in PF is?",
            options: { a: "5 years", b: "10 years", c: "15 years", d: "20 years" },
            correct: "b"
        },
        {
            question: "What is the continues service period of service required for the eligibility to avail Gratuity?",
            options: { a: "3 year", b: "5 Year", c: "10 year", d: "No Limit" },
            correct: "b"
        },
        {
            question: "Minimum Wages Act applicable for?",
            options: { a: "Kerala only", b: "Factory Only", c: "Whole India", d: "None of these" },
            correct: "c"
        },
        {
            question: "Profession tax payable in Panchayath on?",
            options: { a: "December 31", b: "March 31 and September 30", c: "March 31", d: "February 28/29 and August 31" },
            correct: "d"
        },
        {
            question: "How many days leave can be availed in a year under Payment of Gratuity Act?",
            options: { a: "10", b: "15", c: "30", d: "21" },
            correct: "d"
        },
        {
            question: "What is the ceiling for eligibility for Bonus under Payment of Bonus Act?",
            options: { a: "₹21,000", b: "₹15,000", c: "₹10,000", d: "₹7,000" },
            correct: "a"
        },
        {
            question: "What is the minimum bonus percentage under Payment of Bonus Act?",
            options: { a: "8.33%", b: "10%", c: "15%", d: "20%" },
            correct: "a"
        }
    ];
}

function getSampleParticipants() {
    return [
        {
            name: "Rahul Sharma",
            email: "rahul.sharma@company.com",
            designation: "HR Manager",
            mobile: "9876543210",
            company: "Tech Solutions Pvt Ltd"
        },
        {
            name: "Priya Nair",
            email: "priya.nair@enterprise.com",
            designation: "Compliance Officer",
            mobile: "9876543211",
            company: "Enterprise Corp"
        },
        {
            name: "Arjun Kumar",
            email: "arjun.kumar@startup.in",
            designation: "Operations Head",
            mobile: "9876543212",
            company: "Startup Innovations"
        },
        {
            name: "Sneha Patel",
            email: "sneha.patel@manufacturing.com",
            designation: "Labor Relations Manager",
            mobile: "9876543213",
            company: "Manufacturing Industries"
        },
        {
            name: "Vikram Singh",
            email: "vikram.singh@consulting.co.in",
            designation: "Legal Advisor",
            mobile: "9876543214",
            company: "Legal Consulting Firm"
        },
        {
            name: "Anita Krishnan",
            email: "anita.krishnan@healthcare.org",
            designation: "Admin Manager",
            mobile: "9876543215",
            company: "Healthcare Solutions"
        },
        {
            name: "Suresh Menon",
            email: "suresh.menon@finance.com",
            designation: "Finance Director",
            mobile: "9876543216",
            company: "Financial Services Ltd"
        },
        {
            name: "Kavitha Reddy",
            email: "kavitha.reddy@retail.in",
            designation: "HR Executive",
            mobile: "9876543217",
            company: "Retail Chain Stores"
        },
        {
            name: "Deepak Agarwal",
            email: "deepak.agarwal@logistics.com",
            designation: "Operations Manager",
            mobile: "9876543218",
            company: "Logistics & Transport"
        },
        {
            name: "Meera Joshi",
            email: "meera.joshi@education.ac.in",
            designation: "Administrative Officer",
            mobile: "9876543219",
            company: "Educational Institution"
        }
    ];
}

// Run seeding if called directly
if (require.main === module) {
    seedDatabase().catch(console.error);
}

module.exports = { seedDatabase };