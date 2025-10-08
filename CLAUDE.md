# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Node.js + PostgreSQL live quiz competition application designed for conducting real-time quizzes for up to 300 concurrent participants. The system focuses on company HR/Labour law compliance quizzes with specific timing requirements and prize allocation.

## Key Requirements

- **Scale**: Support 1000 concurrent users
- **Quiz Timing**: 
  - Quiz starts at 04:00 AM
  - 5 minutes reading/instruction time (excludes from quiz timer)
  - 15 minutes actual quiz time
  - Auto-submit when timer expires
- **Real-time**: Live synchronization, countdown timers, instant results
- **Prize System**: First and Second prize winners based on score + completion time
- **Domain**: HR/Labour law compliance questions (EPF, ESI, POSH Act, etc.)
- **Database**: PostgreSQL for persistence, Redis recommended for session management

## Detailed Features

### User Authentication & Management
- Admin uploads participant data via Excel/CSV (Name, Designation, Email, Mobile, Company)
- System auto-generates login credentials
- Credentials distributed via email/SMS
- Only registered participants can access quiz

### Quiz Flow
1. **Login** → Participant authentication
2. **Quiz Info Screen** → Display participant details and instructions
3. **5-minute Reading Time** → Instructions and preparation (not counted in quiz timer)
4. **15-minute Quiz Timer** → Actual quiz time with real-time countdown
5. **Questions** → One question at a time, MCQ with radio buttons
6. **Navigation** → Next/Previous, skip and return to questions
7. **Submission** → Manual submit or auto-submit on timer expiry

### Timer Requirements
- 15:00 minute countdown (excludes instruction time)
- Updates every second
- Last 1 minute turns red
- Auto-submits when time expires

### Prize Allocation Logic
- Rank by highest score first
- Tie-breaker: Earlier completion time wins
- Display First Prize (🥇) and Second Prize (🥈) winners
- Winners shown on results screen and leaderboard

### Results Display
After submission/timeout, show:
- Congratulations message
- Correct/Incorrect/Unanswered counts
- Total time taken
- Prize winners announcement
- Detailed question-by-question analysis

## Architecture Recommendations

The application should follow a real-time architecture:

- **Backend**: Node.js + Express.js + Socket.io for WebSocket communication
- **Database**: PostgreSQL for quiz data, user management, and results
- **Caching**: Redis for session management and real-time state
- **Frontend**: React.js for both admin and participant interfaces
- **Authentication**: JWT-based with session management

## Core Components to Implement

### Database Schema
- `participants` - Uploaded participant data (Name, Designation, Email, Mobile, Company)
- `user_credentials` - Auto-generated login credentials
- `quizzes` - Quiz metadata and configuration
- `questions` - Question bank with multiple choice answers and correct answers
- `quiz_sessions` - Active quiz instances with timing and scheduling
- `participant_answers` - Real-time answer tracking with timestamps
- `results` - Score calculation, completion time, and rankings
- `prize_winners` - First, second, and third prize winner records

### Real-time Features
- WebSocket rooms for quiz sessions
- Synchronized countdown timers (15:00 minutes, red for last minute)
- Live participant count and status
- Auto-submission when time expires
- Instant result calculation and prize winner announcement
- Real-time leaderboard updates

### Admin Panel Features
- Excel/CSV upload for participants and questions
- Auto-generate and distribute login credentials via email/SMS
- Real-time monitoring of quiz progress
- Results export (Excel/PDF)
- Prize winner management and reporting
- Performance analysis and statistics

### Performance Considerations
- Connection pooling for PostgreSQL
- Redis clustering for horizontal scaling
- Load balancing with Nginx
- Efficient Socket.io room management
- Optimized queries for 300+ concurrent users

## Sample Question Format

Questions follow multiple choice format with 4 options (a, b, c, d):
```
Question: "Which one of the following is not coming under EPF?"
Options: a. UAN, b. PPO, c. EPS, d. None of these
```

Questions cover topics: EPF, ESI, POSH Act, Payment of Bonus Act, Minimum Wages Act, Labour laws, etc.

## Security & Compliance

- No malicious code or exploit development
- Focus on defensive security practices
- Secure session management for quiz integrity
- Input validation for all user submissions
- Rate limiting for API endpoints

## Critical Implementation Details

### Quiz Workflow
1. Admin uploads participant data and questions
2. System generates login credentials and sends via email/SMS
3. At 04:00 AM, participants log in
4. 5-minute instruction period (not counted in timer)
5. 15-minute quiz timer starts
6. Questions displayed one at a time with navigation
7. Manual submit or auto-submit at timer expiry
8. Immediate score calculation and prize winner announcement
9. Results display with detailed analysis

### Technical Specifications
- **Question Display**: One question per screen with radio button options
- **Navigation**: Next/Previous buttons, ability to skip and return
- **Timer Behavior**: 15:00 countdown, red color for last minute
- **Ranking Logic**: Score first, then completion time as tie-breaker
- **Prize Display**: First (🥇) and Second (🥈) winners shown to all participants

## Development Priority

1. Database schema with participant management
2. Admin panel for data upload and credential generation
3. Real-time communication infrastructure (Socket.io)
4. Timer synchronization system with dual timers (instruction + quiz)
5. User authentication and session management
6. Single-question display interface with navigation
7. Prize calculation and winner announcement system
8. Results module with detailed analysis
9. Performance optimization for concurrent users