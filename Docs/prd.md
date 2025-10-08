**Online Quiz Competition Application**

**1\. User Login Module**

**Purpose:**

Authenticate and allow only registered participants to access the quiz.

**Features:**

*   **Participant Data Upload**

*   Admin uploads an Excel/CSV file with participant details:

*   Name
*   Designation
*   Email
*   Mobile
*   Company

*   **Account Generation**

*   System automatically creates login credentials (username/password).
*   Credentials distributed to participants via email/SMS.

*   **Secure Access**

*   Only registered participants can log in.
*   After login → Redirected to the **Quiz Module**.

**2\. Quiz Module**

**Purpose:**

Main area where participants attempt the quiz.

**Components:**

**_2.1 Quiz Info Section_**

*   Displays **Name, Email, Mobile**.
*   Shows a **welcome message and exam instructions**:

*   Quiz starts at **04:00 AM**.
*   **5 minutes reading time** (system alerts user to start quiz after this).
*   **15 minutes exam time**.
*   Auto-submit when timer ends.
*   Questions appear **one at a time**.
*   Participants can **skip & return** to questions.
*   Once submitted, answers **cannot be changed**.

**_2.2 Timer_**

*   **15:00 minutes countdown** (excludes 5-minute instruction time).
*   Updates in real-time.
*   Last 1 minute → Timer turns **red**.
*   Auto-submits when time runs out.

**_2.3 Questions Area_**

*   Displays MCQs (Multiple Choice Questions).
*   Options shown with **radio buttons**.
*   One question visible at a time.

**_2.4 Navigation_**

*   **Next / Previous** buttons.
*   Jump back to skipped questions.

**_2.5 Quiz Actions (Updated with Prizes)_**

*   **Submit Button** → End exam before time expires.
*   **Auto-submit** → Triggered when timer ends.
*   **After Submission or Time Expiry:**

*   System displays:

*   ✅ Congratulations message.
*   ✅ Number of Correct, Incorrect, and Unanswered questions.
*   ✅ Total time taken.

*   **Prize Display (New Feature):**

*   Ranking calculated across all participants:

*   Higher score ranks higher.
*   If two participants have same score → Earlier completion time ranks higher.

*   System announces:

*   🥇 **First Prize Winner** → Name, Score, Time.
*   🥈 **Second Prize Winner** → Name, Score, Time.

*   Displayed on participant screen & results board.

**3\. Results Module**

**Purpose:**

Provide participants with a **summary and detailed analysis** of performance.

**Features:**

*   **Final Score Summary**

*   Total marks.
*   Percentage score.
*   Completion time.

*   **Statistics Section**

*   Number of correct answers.
*   Number of incorrect answers.
*   Skipped/unanswered questions.
*   Time taken.
*   Performance Category: _Excellent / Good / Needs Improvement_.

*   **Detailed Results**

*   For each question:

*   Question text.
*   User’s answer.
*   Correct answer.
*   Indicator → ✔ Correct / ✖ Incorrect.

*   **Leaderboard / Prize Announcement**

*   🥇 First Prize Winner: Name + Marks + Completion Time.
*   🥈 Second Prize Winner: Name + Marks + Completion Time.
*   Visible to all participants once the quiz ends.
*   Stored in database for admin reporting.

*   **Motivation**

*   Encourages participants to review answers and improve.

**4\. Admin Panel Module**

**Purpose:**

Centralized control for quiz setup, participant management, and monitoring results.

**Features:**

*   **Data Upload**

*   Upload quiz questions (with correct answers).
*   Upload participant list (Excel/CSV).

*   **Result Monitoring**

*   Results table includes:

*   Participant Name
*   Employee ID / Designation
*   Score (%)
*   Time Taken
*   Date of Attempt
*   Action → _View Details_ (detailed report).

*   **Leaderboard & Prize Control**

*   View **Top Performers** with time priority rule.
*   Export prize winners list to Excel/PDF.

*   **Reports**

*   Download overall quiz results.
*   Generate performance analysis reports.

**5\. Timer Module**

**Purpose:**

Handle countdown for quiz fairness.

**Features:**

*   Starts at **15:00 minutes** (after 5-min instruction time).
*   Updates every second.
*   Last minute → Turns **red**.
*   Auto-submits quiz on **time expiry**.

**6\. Prize Allocation Logic**

**Business Rules:**

*   Rank participants by **Score**.
*   If tie → Earlier submission time wins.
*   First two ranks displayed as winners.

**Display Flow:**

*   After quiz submission or timeout:

*   System calculates marks.
*   Stores score + time in database.
*   Compares across all participants.
*   Declares:

*   🥇 First Prize Winner.
*   🥈 Second Prize Winner.

*   Visible on **Result Screen & Leaderboard**.

**7\. System Workflow (Step-by-Step)**

1.  **Admin uploads participants & quiz questions**.
2.  Participants receive login credentials.
3.  At scheduled time, participants **log in**.
4.  5-minute instruction screen shown.
5.  Quiz starts → 15-minute timer begins.
6.  Participants attempt questions, can skip/return.
7.  Quiz ends by:

*   Manual submission OR
*   Auto-submit at time expiry.

8.  System processes answers, calculates score.
9.  Result screen displays:

*   Correct / Incorrect / Unanswered count.
*   Time taken.
*   🥇 First Prize Winner & 🥈 Second Prize Winner (after comparison).

10.  Admin views/export results in Admin Panel.