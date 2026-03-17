# 📋 Esplitter Web - Comprehensive Development Roadmap

**Project:** Offline-First Group Expense Tracker (Web PWA)  
**Status:** Ready for Development  
**Last Updated:** February 14, 2026

---

## 🎯 Project Phases Overview

- **Phase 1: Foundation** - Project setup, infrastructure, and core backend
- **Phase 2: Auth System** - Authentication (OTP or password), JWT, user profiles
- **Phase 3: Group Management** - Create, join, members, auto-archive
- **Phase 4: Offline Storage** - IndexedDB setup, local persistence
- **Phase 5: Expenses & Splitting** - Expense entry, split logic, balance computation
- **Phase 6: Sync Mechanism** - Offline sync queue, server sync endpoint, conflict resolution
- **Phase 7: Media & Receipts** - Camera access, receipt capture, QR code scanning, image upload
- **Phase 8: Payments** - UPI deep links, QR generation, settlement UI
- **Phase 9: UI/UX** - Responsive design, network indicator, loading states
- **Phase 9B: Monitoring** - Sentry, error tracking, performance metrics
- **Phase 10: Testing** - Unit, integration, E2E tests
- **Phase 11: PWA** - Manifest, service worker, installation
- **Phase 12: Performance** - Optimization, caching, indexing
- **Phase 13: Deployment** - Vercel, Render, MongoDB, CI/CD
- **Phase 14: Documentation** - Code docs, user guide, API docs
- **Phase 15: Enhancements** - Advanced features, future improvements

---

## 📦 PHASE 1: PROJECT FOUNDATION & INFRASTRUCTURE

### 1.1 Repository & Project Setup
- [ ] Initialize Git repository
- [ ] Create GitHub repository and configure main/develop branches
- [ ] Set up .gitignore for both frontend and backend
- [ ] Create root directory structure: `/frontend`, `/backend`, `/docs`
- [ ] Set up project documentation in root README.md
- [ ] Configure environment file templates (.env.example)

### 1.2 Frontend Environment Setup
- [ ] Initialize frontend project structure with HTML, CSS, JS hierarchy
- [ ] Create `/public` directory with `index.html` template
- [ ] Set up folder structure: `/src/components`, `/src/utils`, `/src/services`, `/src/db`, `/src/sync`
- [ ] Set up local development server (use simple HTTP server or Vite)
- [ ] Configure HTTPS for local development (required for service worker and camera)
- [ ] Create manifest.json for PWA configuration (placeholder, will complete in Phase 11)

### 1.3 Backend Environment Setup
- [ ] Initialize Node.js project with `npm init`
- [ ] Install Express.js and core dependencies
- [ ] Set up folder structure: `/controllers`, `/routes`, `/models`, `/middleware`, `/services`, `/config`
- [ ] Configure environment variables (.env with PORT, DB_URL, JWT_SECRET, CLOUDINARY_KEY, etc.)
- [ ] Set up logging with Morgan middleware
- [ ] Initialize database connection file (MongoDB Atlas connection string)

### 1.4 Database Setup
- [ ] Create MongoDB Atlas project and cluster
- [ ] Set up database user with appropriate permissions
- [ ] Create connection string with credentials
- [ ] Set up initial database and collections structure
- [ ] Configure IP whitelist for development and production

### 1.5 Deployment Infrastructure
- [ ] Set up Vercel account and connect GitHub repository for frontend
- [ ] Set up Render or Railway account for backend hosting
- [ ] Configure environment variables on hosting platforms
- [ ] Set up MongoDB Atlas for cloud database
- [ ] Set up Cloudinary account for image storage and API keys
- [ ] Create deployment documentation

---

## 👥 PHASE 2: AUTHENTICATION SYSTEM

### ⚠️ CRITICAL: Choose Authentication Method First
**Decision needed before starting Phase 2:**
- [ ] **Option A:** Password-based authentication with bcrypt
- [ ] **Option B:** Passwordless OTP via Email (PRD recommended)
- [ ] **Option C:** Passwordless OTP via SMS (requires Twilio)

**Decision: ___________________** (Fill this in)

### 2.1 Backend Authentication Setup
- [ ] Design User schema in MongoDB: 
  ```
  { _id, name, email, phone, upiId, passwordHash (if password auth), createdAt, updatedAt }
  ```
- [ ] Create User model using Mongoose
- [ ] If password-based: 
  - [ ] Implement bcrypt password hashing utility (salt rounds: 10+)
  - [ ] Validate password strength (min 8 chars, uppercase, number, special)
- [ ] If OTP-based:
  - [ ] Create OTP schema (email/phone, otp, expiresAt, attempts)
  - [ ] Implement OTP generation (6-digit)
  - [ ] Set OTP expiry to 10 minutes
  - [ ] Setup email service (Nodemailer or SendGrid)
  - [ ] Optional: Setup SMS service (Twilio)
- [ ] Set up JWT token generation and validation
- [ ] Configure JWT secret in environment variables
- [ ] Set JWT expiry: 15 minutes for access token
- [ ] Implement refresh token mechanism (long-lived, stored in HTTP-only cookie)
- [ ] Create token blacklist for logout (or use no-op if stateless preferred)

### 2.2 Backend Auth Routes & Controllers
- [ ] Create `/auth/register` POST endpoint
  - [ ] Validate email uniqueness (case-insensitive)
  - [ ] Validate phone uniqueness (if Phone auth)
  - [ ] For password auth: Hash password with bcrypt, validate strength
  - [ ] For OTP auth: Store email/phone without password
  - [ ] Create user record in MongoDB with createdAt
  - [ ] Return user object and JWT token (if password)
  - [ ] For OTP: Trigger send-otp flow
- [ ] Create `/auth/send-otp` POST endpoint (OTP auth only)
  - [ ] Accept email or phone
  - [ ] Validate email/phone exists
  - [ ] Generate 6-digit OTP
  - [ ] Store OTP with 10-minute expiry
  - [ ] Send OTP via email/SMS
  - [ ] Increment attempt counter
  - [ ] Rate limit: Max 3 per 30 minutes
  - [ ] Return success message
- [ ] Create `/auth/verify-otp` POST endpoint (OTP auth only)
  - [ ] Accept email/phone and OTP
  - [ ] Validate OTP against stored value
  - [ ] Check expiry (10 minutes)
  - [ ] Rate limit: Max 5 failed attempts
  - [ ] Add exponential backoff after failures
  - [ ] Generate JWT access token and refresh token
  - [ ] Return token and user data
- [ ] Create `/auth/login` POST endpoint (Password auth only)
  - [ ] Accept email and password
  - [ ] Validate user exists
  - [ ] Verify password against hash using bcrypt
  - [ ] Rate limit: Max 5 attempts per 15 minutes per IP
  - [ ] Generate JWT token
  - [ ] Return token and user data
- [ ] Create `/auth/refresh` POST endpoint
  - [ ] Accept refresh token (from HTTP-only cookie)
  - [ ] Validate refresh token
  - [ ] Generate new access token
  - [ ] Optionally rotate refresh token
  - [ ] Return new access token
- [ ] Create `/auth/logout` POST endpoint
  - [ ] Add token to blacklist (optional)
  - [ ] Clear refresh token cookie
  - [ ] Return success
- [ ] Create `PUT /user/profile` endpoint
  - [ ] Update user name, phone
  - [ ] Validate user owns profile
  - [ ] Return updated user
- [ ] Create `PUT /user/upi-id` endpoint
  - [ ] Update user UPI ID (e.g., user@upi)
  - [ ] Validate UPI ID format
  - [ ] Return updated user
- [ ] Implement JWT middleware for protected routes
  - [ ] Extract token from Authorization header
  - [ ] Validate token signature and expiry
  - [ ] Attach user to request object
  - [ ] Handle expired token (return 401)
  - [ ] Handle invalid token (return 401)

### 2.3 Frontend Authentication UI
- [ ] Determine which auth method will be used (from Phase 2 decision)
- [ ] Create login/register page (HTML + CSS)
  - [ ] If password-based:
    - [ ] Email and password input fields
    - [ ] Password strength indicator
    - [ ] Show/hide password toggle
    - [ ] Forgot password link (optional for Phase 1)
  - [ ] If OTP-based:
    - [ ] Email/phone input field
    - [ ] "Send OTP" button
    - [ ] OTP input field (6 digits, auto-focus)
    - [ ] "Verify OTP" button
    - [ ] Resend OTP link (disabled until expiry)
    - [ ] Timer showing OTP expiry (10 min countdown)
    - [ ] Retry count display
- [ ] Create register screen (HTML + CSS)
  - [ ] Full name input field
  - [ ] Email input field
  - [ ] Phone input field (optional)
  - [ ] If password auth: Password and confirm password fields
  - [ ] Register button
  - [ ] Link to login
  - [ ] Terms and privacy checkbox
  - [ ] Error/validation display
- [ ] Create profile/settings screen (HTML + CSS)
  - [ ] Display user: name, email, phone
  - [ ] Edit name button
  - [ ] UPI ID input field (important for payments)
  - [ ] UPI ID validation tooltip ("user@upi format")
  - [ ] Save changes button
  - [ ] Logout button
  - [ ] Success/error messages

### 2.4 Frontend Auth Logic
- [ ] Create authentication service module (`/src/services/auth.js`)
  - [ ] If OTP-based:
    - [ ] `sendOTP(emailOrPhone)` - POST to /auth/send-otp
    - [ ] `verifyOTP(emailOrPhone, otp)` - POST to /auth/verify-otp
    - [ ] `startOTPTimer(durationMs)` - Timer function (10 min countdown)
    - [ ] `getOTPResendAvailable()` - Check if resend enabled
  - [ ] If password-based:
    - [ ] `login(email, password)` - POST to /auth/login
    - [ ] `register(name, email, password)` - POST to /auth/register
  - [ ] Token storage and retrieval:
    - [ ] `setToken(token, refreshToken)` - Store tokens
    - [ ] `getToken()` - Retrieve access token
    - [ ] `getRefreshToken()` - Retrieve refresh token
    - [ ] `clearTokens()` - Clear all tokens
  - [ ] `refreshToken()` - POST to /auth/refresh
  - [ ] `logout()` - POST to /auth/logout
  - [ ] `isAuthenticated()` - Check if user has valid token
- [ ] Implement auth state in AppState
  - [ ] `currentUser`: { id, name, email, phone, upiId }
  - [ ] `isAuthenticated`: boolean
  - [ ] `authToken`: JWT token
  - [ ] `OTPResendCount`: counter for rate limiting UI
  - [ ] `authError`: error message string
- [ ] Create protected route guard
  - [ ] Check isAuthenticated on app load
  - [ ] Redirect unauthenticated users to login
  - [ ] Redirect authenticated users away from auth pages
  - [ ] Validate token on app resume
- [ ] Implement token auto-refresh
  - [ ] Call refreshToken() before expiry (15 min access token)
  - [ ] Handle refresh failure (logout user)
- [ ] Create UPI ID input in profile
  - [ ] Allow input and update
  - [ ] Validate UPI ID format (xxx@upi)
  - [ ] Show validation error if invalid
  - [ ] Save to backend on update
  - [ ] Show success message on save

### 2.5 Security Implementation
- [ ] Backend rate limiting:
  - [ ] If OTP: Max 3 send-otp per 30 minutes per email/phone
  - [ ] If OTP: Max 5 verify-otp failures per OTP
  - [ ] Max 5 login attempts per 15 minutes per IP
  - [ ] Use express-rate-limit middleware
- [ ] Backend input validation (express-validator):
  - [ ] Validate email format
  - [ ] Validate phone format (if applicable)
  - [ ] Validate OTP is 6 digits
  - [ ] Validate password strength (if password auth)
  - [ ] Validate UPI ID format
- [ ] Backend security headers (Helmet.js):
  - [ ] X-Frame-Options: DENY
  - [ ] X-Content-Type-Options: nosniff
  - [ ] Content-Security-Policy
  - [ ] X-XSS-Protection: 1; mode=block
  - [ ] Strict-Transport-Security (HSTS)
- [ ] Cookie security settings:
  - [ ] HttpOnly: true (prevent JS access)
  - [ ] Secure: true (HTTPS only)
  - [ ] SameSite: Strict (CSRF prevention)
- [ ] Frontend security:
  - [ ] Never store plain passwords
  - [ ] Never log sensitive data (tokens, OTPs, passwords)
  - [ ] Clear sensitive data from memory after use
  - [ ] Sanitize user inputs before displaying
  - [ ] Implement XSS prevention (DOMPurify or similar)
- [ ] HTTPS enforcement:
  - [ ] Frontend deployed over HTTPS only
  - [ ] Backend API over HTTPS only
  - [ ] Mixed content blocking enabled

---

## 👫 PHASE 3: GROUP MANAGEMENT

### 3.1 Backend Group Schema & Model
- [ ] Design Group schema:
  ```
  { _id, name, description, adminId, members: [userId], 
    inviteCode, lastActivityAt, isArchived, createdAt, updatedAt }
  ```
- [ ] Create Group model using Mongoose
- [ ] Add indexes:
  - [ ] Index on (adminId, createdAt) for query optimization
  - [ ] Index on inviteCode (unique)
  - [ ] Index on lastActivityAt (for auto-archive query)

### 3.2 Backend Group Routes & Controllers
- [ ] Create `POST /groups` endpoint (create group)
  - [ ] Validate user authentication
  - [ ] Validate group name (required, max 100 chars)
  - [ ] Generate unique invite code (6-8 alphanumeric, function to ensure uniqueness)
  - [ ] Create group with current user as admin
  - [ ] Set lastActivityAt to current timestamp
  - [ ] Return group object with invite code
- [ ] Create `GET /groups` endpoint (list user's groups)
  - [ ] Return all groups current user belongs to
  - [ ] Include admin status for each
  - [ ] Sort by lastActivityAt descending
- [ ] Create `GET /groups/:id` endpoint (get group detail)
  - [ ] Validate user belongs to group
  - [ ] Return group with members array (include names)
  - [ ] Return transaction count
  - [ ] Return current member count
- [ ] Create `POST /groups/:id/join` endpoint (join group via code)
  - [ ] Accept inviteCode parameter
  - [ ] Validate invite code matches groupId
  - [ ] Check if user already in group
  - [ ] Add current user to group members
  - [ ] Update lastActivityAt
  - [ ] Return updated group
- [ ] Create `DELETE /groups/:id` endpoint (archive group)
  - [ ] Validate user is admin
  - [ ] Set isArchived = true
  - [ ] Set lastActivityAt
  - [ ] Return success message
- [ ] Create `DELETE /groups/:id/members/:userId` endpoint (remove member)
  - [ ] Validate user is admin
  - [ ] Remove userId from members array
  - [ ] Update lastActivityAt
  - [ ] Return updated group
- [ ] Create `PATCH /groups/:id` endpoint (update group details)
  - [ ] Validate user is admin
  - [ ] Update name, description
  - [ ] Update lastActivityAt
  - [ ] Return updated group
- [ ] Create `GET /groups/:id/members` endpoint (list members)
  - [ ] Validate user belongs to group
  - [ ] Return member objects with name, email, upiId
- [ ] Create scheduled job for auto-archiving:
  - [ ] Query: groups with NO transactions AND lastActivityAt > 6 months ago
  - [ ] Set isArchived = true
  - [ ] Query: archived groups with archiveDate > 1 year ago
  - [ ] Delete permanently
  - [ ] Run daily at off-peak hours (e.g., 2 AM UTC)
- [ ] Middleware: Update lastActivityAt on ANY transaction creation
  - [ ] Update group lastActivityAt when expense added
  - [ ] Update group lastActivityAt when payment added

### 3.3 Frontend Group UI
- [ ] Create Dashboard/Group List screen (HTML + CSS)
  - [ ] List of user's groups (not archived)
  - [ ] Group cards showing:
    - [ ] Group name
    - [ ] Member count
    - [ ] Total balance (user's balance in group)
    - [ ] Last activity date
  - [ ] "Create Group" button
  - [ ] "Join Group" button
  - [ ] "Settings" icon per group
  - [ ] Clicking card navigates to group detail
- [ ] Create Create Group modal (HTML + CSS)
  - [ ] Group name input field
  - [ ] Optional description field
  - [ ] "Create Group" button
  - [ ] Displays generated invite code after creation
  - [ ] "Copy to Clipboard" button for code
  - [ ] "Share" button to generate shareable link
  - [ ] "Done" button to close
- [ ] Create Join Group modal (HTML + CSS)
  - [ ] Invite code input field (6-8 chars)
  - [ ] "Join Group" button
  - [ ] Error message if code invalid
  - [ ] Success message on join
- [ ] Create Group Detail screen (HTML + CSS)
  - [ ] Group name and member list
  - [ ] Member list showing names
  - [ ] Transaction count
  - [ ] Member activity status (optional)
  - [ ] "Add Expense" button
  - [ ] "Settle Up" button
  - [ ] "Settings" button (admin only)
  - [ ] Expense/transaction list section
  - [ ] Leave group button
- [ ] Create Group Settings screen (admin only)
  - [ ] Edit group name
  - [ ] Edit group description
  - [ ] Manage members (remove option)
  - [ ] View invite code
  - [ ] Regenerate invite code (optional)
  - [ ] Archive group button
  - [ ] Leave group button shows "Delete group" for admin

### 3.4 Frontend Group Logic
- [ ] Create group service module (`/src/services/groups.js`)
  - [ ] `createGroup(name, description)` - POST to /groups
  - [ ] `getGroups()` - GET /groups
  - [ ] `getGroupDetail(groupId)` - GET /groups/:id
  - [ ] `joinGroup(inviteCode)` - POST /groups/:id/join
  - [ ] `leaveGroup(groupId)` - DELETE /groups/:id
  - [ ] `updateGroup(groupId, data)` - PATCH /groups/:id
  - [ ] `removeMember(groupId, userId)` - DELETE /groups/:id/members/:userId
  - [ ] `getGroupMembers(groupId)` - GET /groups/:id/members
- [ ] Implement group state in AppState
  - [ ] `groups`: array of group objects
  - [ ] `currentGroupId`: currently selected group ID
  - [ ] `currentGroup`: full group object (with members)
  - [ ] `groupMembers`: array of member objects for current group
- [ ] Create group list rendering logic
  - [ ] Display all groups
  - [ ] Sort by lastActivityAt
  - [ ] Filter out archived groups
- [ ] Implement navigation between dashboard and group detail
  - [ ] Handle back button
  - [ ] Preserve scroll position (optional)
  - [ ] Load group members when entering group detail
- [ ] Create notification on successful join/create
- [ ] Handle error states (group not found, permission denied, etc.)

### 3.5 Group Sync & Offline
- [ ] Store groups in IndexedDB
  - [ ] Create groups object store in database
  - [ ] Save groups after fetch from server
  - [ ] Store inviteCode with group (needed for rejoining if lost)
- [ ] Implement offline access to cached groups
  - [ ] Load groups from IndexedDB on app load
  - [ ] Display cached data while fetching fresh data
  - [ ] Show "offline" indicator
- [ ] Add group creation to sync queue when offline
  - [ ] Mark group as PENDING
  - [ ] Add to syncQueue
  - [ ] Show local groupId to user
- [ ] Add group join to sync queue when offline
  - [ ] Mark join attempt as PENDING
  - [ ] Add to syncQueue
  - [ ] Confirm join when synced
- [ ] Sync new groups from server after coming online
  - [ ] Merge server groups with local groups
  - [ ] Handle duplicates (same ID = update)
- [ ] Handle conflict if group archived on server but edited locally
  - [ ] Server version wins (archived state)
  - [ ] Show warning to user

---

## 🗄️ PHASE 4: OFFLINE STORAGE (IndexedDB)

### 4.1 Frontend IndexedDB Setup
- [ ] Install and configure Dexie.js library
- [ ] Create database schema with version control:
  ```
  Database name: 'EsplitterDB'
  Stores:
    - users: { keyPath: 'id' }
    - groups: { keyPath: '_id' }
    - transactions: { keyPath: '_id' }
    - syncQueue: { keyPath: 'id', autoIncrement: true }
    - appMetadata: { keyPath: 'key' }
  ```
- [ ] Create database initialization function
  - [ ] Handle auto-upgrade on schema changes
  - [ ] Create indexes:
    - [ ] transactions: [groupId, createdAt]
    - [ ] groups: [adminId]
    - [ ] syncQueue: [status, createdAt]
- [ ] Implement database error handling
  - [ ] Handle quota exceeded
  - [ ] Handle disabled IndexedDB (private browser mode)
  - [ ] Fallback to in-memory storage if IndexedDB unavailable
  - [ ] Warn user if IndexedDB cleared

### 4.2 Local Storage Layer (Repository Pattern)
- [ ] Create repository module (`/src/db/repository.js`)
  - [ ] **Users table:**
    - [ ] `saveUser(user)` - Store or update user
    - [ ] `getUser(userId)` - Retrieve user
    - [ ] `getCurrentUser()` - Get logged-in user
  - [ ] **Groups table:**
    - [ ] `saveGroup(group)` - Store or update group
    - [ ] `getGroup(groupId)` - Retrieve group
    - [ ] `getAllGroups()` - Get all groups (not archived)
    - [ ] `getArchivedGroups()` - Get archived groups
  - [ ] **Transactions table:**
    - [ ] `saveTransaction(transaction)` - Store or update transaction
    - [ ] `getTransaction(transactionId)` - Retrieve transaction
    - [ ] `getGroupTransactions(groupId)` - Get all transactions for group
    - [ ] `getGroupTransactionsPaginated(groupId, limit, offset)` - Paginated results
    - [ ] `deleteTransaction(transactionId)` - Delete transaction
    - [ ] `getTransactionsByStatus(status)` - Filter by sync status
  - [ ] **Sync Queue table:**
    - [ ] `addToQueue(operation)` - Add operation to sync queue
    - [ ] `getQueuedOperations()` - Get all pending operations
    - [ ] `getQueuedOperationsByStatus(status)` - Filter by status
    - [ ] `updateQueueItemStatus(id, status)` - Mark synced/failed
    - [ ] `removeFromQueue(id)` - Remove after successful sync
    - [ ] `clearFailedQueue()` - Clear old failed items
- [ ] Mark records with sync status:
  - [ ] `PENDING` - Needs to sync to server
  - [ ] `SYNCED` - Confirmed on server
  - [ ] `FAILED` - Sync attempt failed

### 4.3 Database Utilities
- [ ] Create backup/export utility
  - [ ] Export all IndexedDB data as JSON
  - [ ] Download as file
- [ ] Create import utility
  - [ ] Import previously exported data
  - [ ] Validate data integrity
- [ ] Create database clearing utility
  - [ ] Warn user before clearing
  - [ ] Offer backup before clearing
  - [ ] Clear all stores
- [ ] Monitor IndexedDB usage
  - [ ] Check available quota
  - [ ] Warn if quota > 80%
  - [ ] Suggest clearing old transactions

---

## 💰 PHASE 5: EXPENSES & SPLITTING LOGIC

### 5.1 Backend Transaction Schema & Model
- [ ] Design Transaction schema:
  ```
  { _id, groupId, type: "EXPENSE" | "PAYMENT",
    amount, payerId, receiverId (for PAYMENT),
    splits: [{ userId, share }],
    description, imageUrl, UUID,
    syncedAt, createdAt, updatedAt }
  ```
- [ ] Create Transaction model using Mongoose
- [ ] Add indexes:
  - [ ] (groupId, createdAt) - Main query for group transactions
  - [ ] (groupId, type) - Filter by expense vs payment
  - [ ] UUID - Deduplication during sync

### 5.2 Backend Transaction Routes
- [ ] Create `POST /transactions` endpoint
  - [ ] Validate user belongs to group
  - [ ] Validate amount > 0
  - [ ] Validate splits sum to 100% (or total amount)
  - [ ] Validate payerId is group member
  - [ ] Validate all recipients are group members
  - [ ] Generate UUID for deduplication
  - [ ] Create transaction record
  - [ ] Update group lastActivityAt
  - [ ] Return created transaction
- [ ] Create `GET /groups/:id/transactions` endpoint
  - [ ] Validate user belongs to group
  - [ ] Return transactions for group (paginated)
  - [ ] Default limit: 50 per page
  - [ ] Sort by createdAt descending
  - [ ] Include payer/payee user names
- [ ] Create `GET /groups/:id/transactions?search=xxx` endpoint
  - [ ] Filter by description
  - [ ] Filter by amount range
  - [ ] Filter by date range
  - [ ] Filter by payer
  - [ ] Return paginated results
- [ ] Create `DELETE /transactions/:id` endpoint
  - [ ] Validate user is group admin
  - [ ] Delete transaction
  - [ ] Update group lastActivityAt
  - [ ] Return success
- [ ] Create `PUT /transactions/:id` endpoint (for metadata updates)
  - [ ] Validate user is group admin
  - [ ] Allow updating description only (not amounts)
  - [ ] Update lastActivityAt
  - [ ] Note: Amounts/splits are immutable

### 5.3 Balance Computation Engine
- [ ] Create balance calculation algorithm:
  ```
  Algorithm:
  1. Initialize empty balance map for each user in group
  2. Iterate through all transactions chronologically
  3. For EXPENSE type:
     - Subtract each participant's share from their balance
     - Add total amount to payer's balance
  4. For PAYMENT type:
     - Add amount to payer's balance
     - Subtract amount from receiver's balance
  5. Return final balance map { userId: balance }
  ```
- [ ] Implement function `computeBalances(transactions)`
  - [ ] Time complexity: O(n) where n = transaction count
  - [ ] Handle edge cases (no transactions, single user, etc.)
- [ ] Implement caching layer
  - [ ] Cache computed balances per group session
  - [ ] Invalidate cache on new transaction
  - [ ] Clear cache on sync
- [ ] Create backend endpoint `GET /groups/:id/balances`
  - [ ] Compute and return balances for all group members
  - [ ] Return object: { userId: balance }
  - [ ] Cache result (optional)
- [ ] Create validation/test cases
  - [ ] Test with equal split
  - [ ] Test with custom splits
  - [ ] Test with payments
  - [ ] Test settlement (balance should be 0)
  - [ ] Test with 10+ transactions

### 5.4 Frontend Expense Entry UI
- [ ] Create Add Expense modal/screen (HTML + CSS)
  - [ ] **Amount input field**
    - [ ] Currency symbol (₹ for INR)
    - [ ] Number input with decimal support
    - [ ] Clear on focus
  - [ ] **Description input field**
    - [ ] Text input (max 200 chars)
    - [ ] Optional/suggested placeholders
  - [ ] **Payer dropdown**
    - [ ] Select who paid
    - [ ] Default to current user
    - [ ] Show all group members
  - [ ] **Split type selector** (radio buttons or tabs)
    - [ ] Equal split
    - [ ] Custom split
    - [ ] Percentage split
  - [ ] **Participants section**
    - [ ] Show all group members
    - [ ] Checkboxes to select who shares
    - [ ] At least 2 must be selected
  - [ ] **Split preview**
    - [ ] For equal: Show calculated share per person
    - [ ] For custom: Show amount per person (editable)
    - [ ] For percentage: Show percentage per person
    - [ ] Total amount validation
  - [ ] **Attach receipt button**
    - [ ] Camera icon
    - [ ] Opens camera modal
    - [ ] Shows receipt image preview
    - [ ] Remove image button
  - [ ] **Submit button**
    - [ ] Validation before submit
    - [ ] Loading state during submission
    - [ ] Show error if submission fails
  - [ ] **Cancel button**
- [ ] Create split detail input form (HTML + CSS)
  - [ ] For custom split: Show input field for each participant
  - [ ] For percentage: Show percentage inputs
  - [ ] Show total (should equal 100% or amount)
  - [ ] Validation errors if total incorrect
  - [ ] Help text: "Must sum to [amount] or [100%]"

### 5.5 Frontend Expense Logic
- [ ] Create expense service module (`/src/services/expenses.js`)
  - [ ] `createExpense(groupId, expenseData)` - POST /transactions
  - [ ] `getTransactions(groupId, page)` - GET /groups/:id/transactions
  - [ ] `deleteExpense(transactionId)` - DELETE /transactions/:id
  - [ ] `searchTransactions(groupId, filters)` - Filter transactions
- [ ] Implement split calculation logic
  - [ ] `calculateEqualSplit(amount, participantCount)` - Returns per-person share
  - [ ] `validateCustomSplit(splits, amount)` - Check splits sum to amount
  - [ ] `calculatePercentageSplit(amount, percentages)` - Convert % to amount
  - [ ] `validatePercentageSplit(percentages)` - Check sum to 100%
- [ ] Implement balance computation on client
  - [ ] `computeBalances(transactions)` - Calculate balances
  - [ ] Cache balances during session
  - [ ] Invalidate cache on transaction add/delete
- [ ] Create transaction state in AppState
  - [ ] `transactions`: array of transaction objects
  - [ ] `balances`: computed balance map
  - [ ] `groupTotal`: total expenses in group
- [ ] Implement expense list rendering
  - [ ] Display transactions newest first
  - [ ] Show amount, description, payer, date
  - [ ] Show receipt icon if image attached
  - [ ] Clickable to view detail
- [ ] Create expense detail screen
  - [ ] Show full transaction details
  - [ ] Show receipt image (if attached)
  - [ ] Show split breakdown
  - [ ] Show payer and all recipients with shares
  - [ ] Delete button (admin only)
  - [ ] Back button
- [ ] Add expense to sync queue when offline
  - [ ] Mark as PENDING
  - [ ] Assign temporary UUID
  - [ ] Add to syncQueue
  - [ ] Show notification "Saved offline"

### 5.6 Split Algorithm Implementation
- [ ] Test equal split:
  - [ ] Amount: 150, 3 participants → 50 each
  - [ ] Ensure no rounding errors
- [ ] Test custom split:
  - [ ] Amount: 150, splits: [50, 60, 40] → valid
  - [ ] Amount: 150, splits: [50, 60, 30] → invalid (sum ≠ 150)
- [ ] Test percentage split:
  - [ ] Amount: 150, percentages: [33, 33, 34] → [49.5, 49.5, 51]
  - [ ] Amount: 150, percentages: [50, 25, 25] → [75, 37.5, 37.5]
- [ ] Test with 2 participants (minimum)
- [ ] Test with 10+ participants (edge case)

---

## 🔄 PHASE 6: SYNC MECHANISM

### 6.1 Frontend Network Status Detection
- [ ] Implement online/offline event listeners
  - [ ] `window.addEventListener('online', handleOnline)`
  - [ ] `window.addEventListener('offline', handleOffline)`
- [ ] Create utility function `checkActualConnectivity()`
  - [ ] Perform HEAD request to small endpoint or CDN
  - [ ] Handle false positives (browser reports online but actually offline)
  - [ ] 5-second timeout for requests
  - [ ] Retry with exponential backoff
- [ ] Update NetworkStatus in AppState
  - [ ] `networkStatus`: 'online' | 'offline' | 'checking'
  - [ ] `lastOnlineAt`: timestamp
  - [ ] `lastOfflineAt`: timestamp
  - [ ] `syncQueueSize`: count of pending items
- [ ] Trigger actions on network change
  - [ ] On online: Trigger sync attempt
  - [ ] On offline: Show offline indicator
  - [ ] Log network events for debugging

### 6.2 Frontend Sync Queue Management
- [ ] Create sync queue data structure
  - [ ] Record ID (auto-incrementing)
  - [ ] Operation type: CREATE | UPDATE | DELETE
  - [ ] Data payload (full object)
  - [ ] Resource type: TRANSACTION | GROUP | etc.
  - [ ] Status: PENDING | SYNCED | FAILED
  - [ ] Retry count (start at 0)
  - [ ] Next retry timestamp
  - [ ] Error message (if failed)
  - [ ] Created at, Updated at timestamps
- [ ] Create queue operations (`/src/db/syncQueue.js`)
  - [ ] `addToQueue(operation, data)` - Add operation
  - [ ] `removeFromQueue(queueId)` - Remove after successful sync
  - [ ] `updateQueueStatus(queueId, status, error)` - Update status
  - [ ] `getQueuedOperations()` - Get all PENDING
  - [ ] `getFailedOperations()` - Get all FAILED
  - [ ] `getQueueSize()` - Count of pending items
  - [ ] `clearOldItems(daysOld)` - Remove old entries
- [ ] Implement retry logic
  - [ ] Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s (max 32s)
  - [ ] Max 6 retries per item (if still failing after 63s, mark FAILED)
  - [ ] Calculate nextRetryAt timestamp

### 6.3 Frontend Sync Triggers
- [ ] Create sync service module (`/src/services/sync.js`)
  - [ ] `triggerSync()` - Main sync function
  - [ ] `isSyncInProgress()` - Check if already syncing
  - [ ] `getLastSyncTime()` - When was last successful sync
  - [ ] `getSyncStatus()` - Current sync state
- [ ] Implement sync trigger events:
  - [ ] **On app load:**
    - [ ] Check lastSyncTime in localStorage
    - [ ] If > 5 minutes ago, trigger sync
  - [ ] **When going online:**
    - [ ] Trigger sync immediately
  - [ ] **Manual refresh button:**
    - [ ] User can tap to force sync
    - [ ] Show "Syncing..." indicator
  - [ ] **Periodic timer:**
    - [ ] Every 30 seconds if online and has pending items
    - [ ] Every 60 seconds if online and no pending items
    - [ ] Skip if sync already in progress
- [ ] Implement sync progress indicator
  - [ ] Show sync in progress (spinner)
  - [ ] Show queue size (X items pending)
  - [ ] Show sync success/failure
  - [ ] Show last sync time
  - [ ] Allow retry on failure

### 6.4 Backend Sync Endpoint
- [ ] Create `POST /sync` endpoint
  - [ ] Request body:
    ```
    {
      lastSyncAt: timestamp,
      clientUpdates: [
        { id, UUID, type, resource, data, action: CREATE|UPDATE|DELETE }
      ]
    }
    ```
  - [ ] Response body:
    ```
    {
      success: true,
      serverAdds: [transaction objects],
      serverUpdates: [transaction objects],
      serverDeletes: [transaction ids],
      syncTime: timestamp,
      conflicts: [conflict objects]
    }
    ```
- [ ] Sync flow:
  1. [ ] Validate user authentication
  2. [ ] Extract clientUpdates array
  3. [ ] For each update:
     - [ ] Validate user has permission (belongs to group, is admin if editing)
     - [ ] Check for UUID duplicate (deduplication)
     - [ ] Apply action (CREATE, UPDATE, DELETE)
     - [ ] On conflict, resolve using rules (see 6.5)
  4. [ ] Fetch server-side changes since lastSyncAt
  5. [ ] Return all server changes and confirmations
  6. [ ] Update group lastActivityAt
- [ ] Implement validation:
  - [ ] User belongs to group for transactions
  - [ ] User is admin to edit/delete
  - [ ] Amount and splits are valid
  - [ ] All participants are group members
- [ ] Transaction handling:
  - [ ] All-or-nothing: If any item fails, rollback all

### 6.5 Conflict Resolution Strategy
- [ ] **Duplicate UUID detection:**
  - [ ] Server checks if UUID already exists
  - [ ] If exists: Reject as duplicate (no action)
  - [ ] Return conflict: { conflictType: 'DUPLICATE_UUID', uuid }
- [ ] **Immutable transactions:**
  - [ ] Transactions can never be edited (only metadata via metadata updates)
  - [ ] If edit attempted: Reject, return conflict
  - [ ] Metadata can be updated (description)
- [ ] **Last-write-wins for metadata:**
  - [ ] Allow description updates
  - [ ] Check if client updatedAt > server updatedAt
  - [ ] If yes: Apply update
  - [ ] If no: Reject (server version is newer)
- [ ] **Payment transactions:**
  - [ ] Always immutable, can only be created
  - [ ] Mark as settled in balance computation
- [ ] Handle conflicts on client:
  - [ ] Receive conflict array from server
  - [ ] For DUPLICATE_UUID: Remove from local queue (already synced)
  - [ ] For LAST_WRITE_LOSS: Merge server version (server wins)
  - [ ] Warn user of any conflicts

### 6.6 Frontend Sync Logic
- [ ] Create sync implementation (`/src/services/sync.js`)
  - [ ] `executeSync()` function:
    1. [ ] Check if already syncing (prevent concurrent syncs)
    2. [ ] Get lastSyncTime from AppState
    3. [ ] Get pendingOperations from sync queue
    4. [ ] Build request payload
    5. [ ] POST to /sync endpoint
    6. [ ] On success: Process response
    7. [ ] On failure: Mark items as FAILED, exponential backoff
  - [ ] `mergeSyncResponse(response)` function:
    1. [ ] Remove confirmed items from sync queue
    2. [ ] Update locally synced items (mark SYNCED)
    3. [ ] Merge serverAdds into local IndexedDB
    4. [ ] Merge serverUpdates (check lastWrite wins)
    5. [ ] Apply serverDeletes (remove from IndexedDB)
    6. [ ] Update AppState (refresh transactions, balances)
    7. [ ] Update groups lastActivityAt
    8. [ ] Show notification: "All changes synced"
  - [ ] `handleSyncError(error)` function:
    1. [ ] Log error for debugging
    2. [ ] Mark queue items as FAILED
    3. [ ] Calculate next retry time (exponential backoff)
    4. [ ] Show notification: "Sync failed, will retry"
    5. [ ] Schedule next attempt
  - [ ] `handleSyncSuccess()` function:
    1. [ ] Update AppState.lastSyncAt
    2. [ ] Emit 'syncComplete' event
    3. [ ] Notify UI that sync succeeded
- [ ] Implement error handling scenarios:
  - [ ] Network timeout (no internet)
  - [ ] Server error (500)
  - [ ] Validation error (400) - likely user error
  - [ ] Permission error (403) - user not in group
  - [ ] Conflict error (409) - see section 6.5
- [ ] Offline to online transition:
  - [ ] Detect network status change
  - [ ] Trigger sync on going online
  - [ ] Update UI from offline to syncing to online
  - [ ] Show progress if queue is large

### 6.7 Testing Sync Mechanism
- [ ] Test scenarios:
  - [ ] [ ] Create expense offline → sync → verify on server
  - [ ] [ ] Create expense online → verify immediately synced
  - [ ] [ ] Go offline → create expense → go online → sync → verify
  - [ ] [ ] Simultaneous offline edits on different clients → sync with conflict resolution
  - [ ] [ ] Large sync queue (50+ items) → batch sync
  - [ ] [ ] Sync failure → retry with exponential backoff
  - [ ] [ ] UUI deduplication → add same transaction twice, server rejects duplicate
  - [ ] [ ] Payment transaction immutability → cannot edit payment

---

## 📸 PHASE 7: MEDIA, RECEIPTS & QR CODE SCANNING

### 7.0 Camera Features Overview
- [ ] **TWO camera use cases to implement:**
  1. **Expense Receipt Capture** - User takes photo of bill/receipt in expense form
  2. **UPI QR Code Scanning** - User scans QR code for payment settlement
- [ ] Create unified camera modal component
  - [ ] Tab/button to switch between "Capture Receipt" and "Scan QR"
  - [ ] Different UI layouts for each mode
  - [ ] Video stream preview
  - [ ] Close button

### 7.1 Camera Permission & Access
- [ ] Create camera access utility (`/src/utils/camera.js`)
  - [ ] `requestCameraPermission()` - Request permission
  - [ ] `checkCameraPermission()` - Check if already granted
  - [ ] `getCameraStream(constraints)` - Get video stream
  - [ ] `isCameraSupported()` - Check browser support
  - [ ] Handle permission denied gracefully
  - [ ] Store permission status in localStorage
- [ ] Constraints for receipt capture:
  - [ ] `facingMode: 'environment'` (back camera on mobile)
  - [ ] `video: { width: { ideal: 1280 }, height: { ideal: 720 } }`
- [ ] Constraints for QR scanning:
  - [ ] Similar to receipt
  - [ ] Video resolution: match to QR readability
- [ ] Error handling:
  - [ ] NotAllowedError: User denied permission
  - [ ] NotFoundError: No camera device found
  - [ ] NotReadableError: Camera in use by another app
  - [ ] Show user-friendly error messages
- [ ] Fallback for desktop:
  - [ ] File upload instead of camera
  - [ ] "Upload photo" option

### 7.2 Receipt Capture Implementation
- [ ] Create receipt capture UI component
  - [ ] Video stream preview
  - [ ] "Capture" button (takes snapshot)
  - [ ] "Retake" button (go back to preview)
  - [ ] "Accept" button (use captured image)
  - [ ] Flip camera button (front/back)
  - [ ] Close/Cancel button
- [ ] Implement capture logic:
  - [ ] Request camera via `getUserMedia()`
  - [ ] Stream to <video> element
  - [ ] On capture button:
    - [ ] Draw video frame to canvas
    - [ ] Extract image data (canvas.toBlob())
    - [ ] Create preview
  - [ ] On accept:
    - [ ] Compress image
    - [ ] Store in IndexedDB temporarily
    - [ ] Return image blob to expense form
- [ ] Canvas-based image handling:
  - [ ] Draw video to canvas
  - [ ] Get canvas blob via `canvas.toBlob()`
  - [ ] Image format: JPEG/WebP for smaller size

### 7.3 Image Compression & Processing
- [ ] Create image compression utility (`/src/utils/imageCompression.js`)
  - [ ] `compressImage(imageBlob, maxSize, targetQuality)` function:
    1. [ ] Create Image object from blob
    2. [ ] Draw to canvas with max dimensions (1024x1024)
    3. [ ] Use canvas.toBlob with quality: 0.8
    4. [ ] Check size (must be < 2MB)
    5. [ ] If still > 2MB: Reduce dimensions or quality
    6. [ ] Return compressed blob
  - [ ] Max dimensions: 1024x1024 pixels
  - [ ] Max quality: 0.8 (for JPEG)
  - [ ] Max file size: 2MB
- [ ] Validate image:
  - [ ] Check file type (image/jpeg, image/png, image/webp)
  - [ ] Check file size
  - [ ] Show error if invalid
- [ ] Create image preview:
  - [ ] Display compressed image in form
  - [ ] Show file size to user
  - [ ] "Remove image" button

### 7.4 Cloudinary Image Upload Service
- [ ] Set up Cloudinary API:
  - [ ] Create account and get API credentials
  - [ ] Generate upload preset (unsigned)
  - [ ] Configure CORS for web uploads
- [ ] Create image upload service (`/src/services/imageUpload.js`)
  - [ ] `uploadImage(imageBlob)` function:
    1. [ ] Create FormData with image
    2. [ ] POST to Cloudinary API
    3. [ ] Handle upload progress (optional)
    4. [ ] Return uploaded image URL
  - [ ] `getUploadProgress()` - Track upload %
  - [ ] Retry on failure (max 3 times)
- [ ] Error handling:
  - [ ] Network error → Show retry button
  - [ ] Cloudinary error → Show error message
  - [ ] Failed upload → Store in IndexedDB, retry later
- [ ] Fallback mechanism:
  - [ ] If upload fails, store base64 in IndexedDB
  - [ ] Upload to Cloudinary during sync
  - [ ] Track upload status: PENDING, UPLOADED, FAILED
- [ ] Store returned URL in transaction
  - [ ] Cloudinary returns: { url, public_id, etc. }
  - [ ] Extract URL: secure_url field
  - [ ] Store in transaction.imageUrl

### 7.5 QR Code Scanning Implementation
- [ ] Install QR code library (jsQR or ZXing.js)
- [ ] Create QR scanner component (`/src/components/qrScanner.js`)
  - [ ] Video stream preview
  - [ ] "Scan QR" button or auto-scan
  - [ ] Scanning indicator (animated)
  - [ ] "Cancel" button
- [ ] Implement QR detection logic:
  - [ ] Get video stream (same as receipt)
  - [ ] Continuously capture frames from video
  - [ ] Decode QR code from each frame
  - [ ] On successful decode:
    - [ ] Extract UPI link from QR
    - [ ] Parse UPI parameters
    - [ ] Auto-populate payment form
    - [ ] Show confirmation
  - [ ] On decode error:
    - [ ] Continue scanning (retry)
    - [ ] Show "Scanning..." indicator
- [ ] Parse UPI QR format:
  - [ ] QR contains UPI string: `upi://pay?pa=...&pn=...&am=...`
  - [ ] Extract parameters: UPI ID, name, amount
  - [ ] Populate payment form with extracted data

### 7.6 Receipt UI Integration
- [ ] Add image attachment in Add Expense form:
  - [ ] Camera icon/button for receipt capture
  - [ ] Opens unified camera modal
  - [ ] Switch tab to "Capture Receipt"
  - [ ] After capture:
    - [ ] Show preview
    - [ ] "Use this image" button
    - [ ] "Retake" button
  - [ ] Show receipt preview in form
  - [ ] "Remove image" link
  - [ ] Show upload status (uploading.../ uploaded)
- [ ] Display receipt in expense detail screen:
  - [ ] Show thumbnail of receipt
  - [ ] "View full image" → Opens lightbox
  - [ ] "Delete image" option (admin only)
  - [ ] Show upload status if pending
- [ ] Display receipt icon in transaction list:
  - [ ] Small receipt icon if image attached
  - [ ] Hover to show thumbnail (optional)
- [ ] Sync receipt images:
  - [ ] Include imageUrl in transaction
  - [ ] On sync: Upload pending images to Cloudinary
  - [ ] Store returned URL
  - [ ] Track upload status in sync queue

### 7.7 QR Code Integration in Settlement UI
- [ ] Add "Scan QR" option in Settle Up screen:
  - [ ] "Scan UPI QR" button
  - [ ] Opens camera in QR scanning mode
  - [ ] On successful scan:
    - [ ] Extract amount and UPI ID from QR
    - [ ] Auto-populate payment form fields
    - [ ] Show confirmation: "Pay ₹X to UPI ID"
    - [ ] Proceed to payment
- [ ] Generate QR in Settlement UI:
  - [ ] Create QR code from UPI link
  - [ ] Display QR code on screen
  - [ ] User can scan with phone to pay
  - [ ] Show "Scan with phone" instructions

### 7.8 Image & Camera Error Handling
- [ ] Handle permission errors:
  - [ ] Camera permission denied → Show message, offer file upload
  - [ ] File upload fallback for desktop
- [ ] Handle device errors:
  - [ ] No camera available → Show message
  - [ ] Camera in use by another app → Show message, retry button
- [ ] Handle network errors:
  - [ ] Upload fails → Show retry button
  - [ ] Store pending uploads in IndexedDB
  - [ ] Retry on next sync
- [ ] Handle browser compatibility:
  - [ ] Check for getUserMedia support
  - [ ] Check for canvas support
  - [ ] Show helpful message if not supported

---

## 💳 PHASE 8: PAYMENT & SETTLEMENT

### 8.1 UPI Deep Link & QR Code Generation
- [ ] Create UPI link builder utility (`/src/utils/upiLink.js`):
  - [ ] `generateUPILink(upiId, recipientName, amount, description)` function:
    ```
    Format: upi://pay?pa=user@upi&pn=RecipientName&am=100.00&tn=Dinner%20Bill&cu=INR
    ```
    - [ ] pa: UPI ID (e.g., user@upi, user@okhdfcbank)
    - [ ] pn: Recipient name (URL encoded)
    - [ ] am: Amount in rupees (decimal format)
    - [ ] tn: Transaction note/description (URL encoded)
    - [ ] cu: Currency (INR fixed)
  - [ ] Use `encodeURIComponent()` for special characters
  - [ ] Validate UPI ID format (xxx@xxx)
  - [ ] Return full UPI link
- [ ] Create QR code generator utility (`/src/utils/qrGenerator.js`):
  - [ ] `generateQRCode(upiLink, options)` function:
    - [ ] Use qrcode.js library
    - [ ] Generate QR from UPI link
    - [ ] Return as canvas/image data
    - [ ] Options: size, error correction level
  - [ ] `getQRImage(upiLink)` - Get data URL for image display
- [ ] Handle missing/invalid data:
  - [ ] If UPI ID missing: Show "Please set UPI ID in profile"
  - [ ] If amount is 0: Show validation error
  - [ ] If recipient name missing: Use "Payment"
- [ ] Handle desktop browser limitation:
  - [ ] Desktop browsers don't open UPI app via deep link
  - [ ] Show UPI link as copyable text
  - [ ] Show QR code for mobile to scan
  - [ ] Instruction: "Scan with phone to pay or copy link"

### 8.2 Backend Settlement Endpoints
- [ ] Create `GET /groups/:id/settlement` endpoint:
  - [ ] Validate user belongs to group
  - [ ] Compute all balances
  - [ ] Identify who owes whom
  - [ ] Return settlement data:
    ```
    {
      settlements: [
        { from: userId, to: userId, amount, payerName, receiverName, 
          payerUPI, description }
      ],
      unsettledAmount: total,
      allSettled: boolean
    }
    ```
  - [ ] Filter out zero balances
  - [ ] Include UPI IDs for payment generation

### 8.3 Frontend Settlement UI
- [ ] Create Settle Up / Settlement screen (HTML + CSS):
  - [ ] **Balance summary:**
    - [ ] Total unsettled amount
    - [ ] "All settled!" message if zero balance
  - [ ] **Settlement opportunities list:**
    - [ ] "X owes Y: ₹amount" rows
    - [ ] For each row showing:
      - [ ] Payer name and avatar
      - [ ] Arrow "→"
      - [ ] Receiver name and avatar
      - [ ] Amount
      - [ ] "Pay Now" button
    - [ ] Sorted by amount descending
  - [ ] **Generate QR button:**
    - [ ] Generate QR for each payment
  - [ ] **Scan QR button:**
    - [ ] Open camera to scan incoming UPI QR (PRD feature)
  - [ ] **Back button**
- [ ] Create payment detail modal (after tapping "Pay Now"):
  - [ ] Payment summary:
    - [ ] "You owe X: ₹amount"
    - [ ] Recipient name
    - [ ] Recipient UPI ID (if available)
    - [ ] Description: "Settlement for Group Name"
  - [ ] **Payment options:**
    - [ ] "Pay via UPI" button (opens UPI app or shows deep link)
    - [ ] "Generate QR" button (show QR for scanning)
    - [ ] "Copy UPI Link" button (copy to clipboard)
  - [ ] **Manual confirmation:**
    - [ ] After payment (or if manual):
      - [ ] "Confirm Payment" button
      - [ ] Amount confirmation
      - [ ] Timestamp
  - [ ] **Cancel button**

### 8.4 Frontend UPI Payment Flow
- [ ] Create UPI handler (`/src/services/payment.js`):
  - [ ] `initiateUPIPayment(paymentData)` function:
    1. [ ] Generate UPI link from payment data
    2. [ ] Attempt to open UPI app (window.location = upiLink)
    3. [ ] Show fallback link if app doesn't open
    4. [ ] Track that payment was initiated
    5. [ ] Return to app (user must return manually)
  - [ ] `showUPILinkFallback(upiLink)` function:
    - [ ] Show modal with copyable link
    - [ ] Show QR code
    - [ ] Instructions for desktop users
  - [ ] `confirmPayment(paymentData)` function:
    - [ ] Prompt for confirmation
    - [ ] Show amount and recipient again
    - [ ] User confirms payment completed
    - [ ] Return true if confirmed
- [ ] Handle UPI app opening:
  - [ ] Mobile Chrome redirects to UPI app ✓
  - [ ] Desktop Chrome cannot open UPI app → Show fallback ✓
  - [ ] iOS Safari limited support → Show instructions
  - [ ] Other browsers → Show link option
- [ ] Error handling:
  - [ ] UPI app not installed → Show link option
  - [ ] User cancels UPI payment → Return to settlement screen
  - [ ] Network error → Show error message

### 8.5 Payment Confirmation & Transaction Recording
- [ ] Create manual payment confirmation flow:
  - [ ] After user taps UPI/Pay button:
    - [ ] Track that payment was initiated
    - [ ] Return focus to settlement screen (or offer manual confirm)
  - [ ] Show "Mark as Paid" button
    - [ ] Opens confirmation dialog
    - [ ] Shows payment details again
    - [ ] User confirms they completed payment
  - [ ] On confirmation:
    1. [ ] Create PAYMENT transaction locally
    2. [ ] Type: PAYMENT
    3. [ ] payerId: Current user
    4. [ ] receiverId: Recipient
    5. [ ] amount: Payment amount
    6. [ ] UUID: Generate unique ID
    7. [ ] status: PENDING
    8. [ ] Add to sync queue
    9. [ ] Show success notification
    10. [ ] Refresh balance display
- [ ] Implement payment transaction model:
  - [ ] Same as EXPENSE but type: PAYMENT
  - [ ] Immutable once created
  - [ ] Stored in same transactions collection
  - [ ] Reduces both players' balances equally
- [ ] Update balance computation:
  - [ ] Include PAYMENT transactions
  - [ ] After PAYMENT: Balance should decrease for payer
  - [ ] Related balance should increase for receiver (decrease debt)
- [ ] Payment history display:
  - [ ] Show PAYMENT vs EXPENSE separately (optional filter)
  - [ ] Mark payments with "PAID" badge or icon
  - [ ] Show payment confirmation timestamps

### 8.6 Settlement Optimization (Optional Phase 15)
- [ ] Algorithm to minimize transactions needed for settlement:
  - [ ] Input: List of all balances
  - [ ] Output: Minimal list of transactions needed to settle all
  - [ ] Example: If A owes B 100 and B owes C 100, suggest A pays C directly
  - [ ] Use graph-based algorithm
  - [ ] Display "Suggested settlement path"

---

## 🎨 PHASE 9: UI/UX & RESPONSIVE DESIGN

### 9.1 Global Styling & Theme
- [ ] Create CSS variables file (`/src/styles/variables.css`):
  - [ ] **Color palette:**
    - [ ] Primary: #007AFF (blue)
    - [ ] Secondary: #5AC8FA
    - [ ] Success: #34C759 (green)
    - [ ] Danger: #FF3B30 (red)
    - [ ] Warning: #FF9500 (orange)
    - [ ] Light gray: #F2F2F7
    - [ ] Dark gray: #34343C
  - [ ] **Typography:**
    - [ ] Font family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto
    - [ ] H1: 32px, weight 600
    - [ ] H2: 28px, weight 600
    - [ ] H3: 24px, weight 600
    - [ ] Body: 16px, weight 400
    - [ ] Small: 14px, weight 400
  - [ ] **Spacing scale** (in rem): 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8
  - [ ] **Border radius:** 4px, 8px, 12px, 16px, 24px (full)
  - [ ] **Box shadows:**
    - [ ] Subtle: 0 1px 3px rgba(0,0,0,0.1)
    - [ ] Medium: 0 4px 6px rgba(0,0,0,0.1)
    - [ ] Large: 0 10px 20px rgba(0,0,0,0.15)
  - [ ] **Z-index scale:** 10 (dropdown), 100 (modal), 1000 (tooltip)
- [ ] Implement responsive breakpoints:
  - [ ] Mobile: 320px to 767px
  - [ ] Tablet: 768px to 1024px
  - [ ] Desktop: 1025px and above
- [ ] Create base reset CSS (`/src/styles/reset.css`):
  - [ ] Normalize default browser styles
  - [ ] Set box-sizing: border-box
  - [ ] Reset margins and paddings
  - [ ] Set default font family and size

### 9.2 Component Styling
- [ ] **Button styles:**
  - [ ] Primary button (solid background)
  - [ ] Secondary button (outline)
  - [ ] Danger button (red)
  - [ ] Disabled state (gray, no cursor)
  - [ ] Loading state (spinner, disabled)
  - [ ] Active/focused state (different shade)
  - [ ] Minimum touch target: 44x44px
- [ ] **Input field styles:**
  - [ ] Text inputs (border, focus ring)
  - [ ] Number inputs
  - [ ] Dropdown/select inputs
  - [ ] Checkboxes and radio buttons
  - [ ] Error state (red border, error message below)
  - [ ] Success state (green checkmark)
  - [ ] Disabled state (gray)
  - [ ] Focus ring: 2px blue ring
- [ ] **Card component:**
  - [ ] White background
  - [ ] Subtle shadow
  - [ ] Rounded corners (8px)
  - [ ] Padding: 16px
  - [ ] Border on active/hover (optional)
- [ ] **Modal/dialog styling:**
  - [ ] Dark overlay (rgba(0,0,0,0.5))
  - [ ] Centered white box
  - [ ] Close button (X) in corner
  - [ ] Padding: 24px
  - [ ] Max width: 400px on mobile, 500px on desktop
- [ ] **List item styling:**
  - [ ] Flex row with icon, content, action
  - [ ] Divider between items
  - [ ] Hover state (light background)
  - [ ] Padding: 12px
- [ ] **Badge/chip styling:**
  - [ ] Pill-shaped
  - [ ] Small padding
  - [ ] Different colors per status

### 9.3 Layout & Navigation
- [ ] **Mobile navigation:**
  - [ ] Header bar (44px height)
    - [ ] Back button (left, if on detail screen)
    - [ ] Page title (center)
    - [ ] Action button (right, context-aware)
  - [ ] Bottom navigation (56px height)
    - [ ] 3-4 tabs (Home, Add, Profile, Settings)
    - [ ] Icons + labels
    - [ ] Active tab highlight (blue)
- [ ] **Desktop navigation (if applicable):**
  - [ ] Sidebar or top navigation
  - [ ] Menu items with icons
  - [ ] Active highlight
- [ ] **Page transitions:**
  - [ ] Slide in/out animations (optional, subtle)
  - [ ] Fade in for modals
  - [ ] Preserve scroll position on back navigation
- [ ] **Scrollability:**
  - [ ] Main content scrollable
  - [ ] Header sticky (not scroll with content)
  - [ ] Bottom nav sticky

### 9.4 Form Styling & Validation
- [ ] **Form layout:**
  - [ ] Vertical stacking on mobile
  - [ ] Label above input
  - [ ] Spacing: 12px between fields
  - [ ] Padding: 16px around form
- [ ] **Input focus:**
  - [ ] Blue focus ring (2px)
  - [ ] Background slightly changes on focus
  - [ ] Placeholder text fades on focus
- [ ] **Validation feedback:**
  - [ ] Error message below input (red, 12px font)
  - [ ] Red border on error
  - [ ] Success checkmark (green, optional)
  - [ ] Helper text (gray, 12px font, below input)
- [ ] **Form submission:**
  - [ ] Submit button full width on mobile
  - [ ] Loading state during submission (spinner, disabled)
  - [ ] Success message (green, below button)
  - [ ] Error message (red, below button)

### 9.5 Mobile Responsiveness Testing
- [ ] Test on viewport sizes:
  - [ ] iPhone SE (375px)
  - [ ] iPhone 12 (390px)
  - [ ] iOS Safari
  - [ ] Android Chrome
- [ ] Test on actual devices:
  - [ ] iPhone (iOS)
  - [ ] Android phone
  - [ ] Tablet
- [ ] Test scenarios:
  - [ ] Portrait orientation ✓
  - [ ] Landscape orientation ✓
  - [ ] Soft keyboard appearing ✓
  - [ ] Scrolling performance ✓
  - [ ] Touch targets clickable (44px+) ✓
  - [ ] Images load properly ✓
- [ ] Performance on mobile:
  - [ ] < 3 second load time
  - [ ] Smooth scrolling (60 fps)
  - [ ] Quick response to taps

### 9.6 Accessibility & Keyboard Support
- [ ] **Semantic HTML:**
  - [ ] All buttons are `<button>` elements
  - [ ] All links are `<a>` elements
  - [ ] Form inputs have `<label>` elements
  - [ ] Use semantic landmarks: `<header>`, `<nav>`, `<main>`, `<footer>`
- [ ] **Keyboard accessibility:**
  - [ ] Tab order is logical (left to right, top to bottom)
  - [ ] Can reach all interactive elements with Tab key
  - [ ] Enter to submit forms
  - [ ] Escape to close modals
  - [ ] Arrow keys for selection (optional)
- [ ] **Focus visible:**
  - [ ] Focus ring is visible on all interactive elements
  - [ ] Focus ring is at least 2px blue
  - [ ] Clear contrast (dark on light background)
- [ ] **Color contrast:**
  - [ ] Text color contrast ratio ≥ 4.5:1 (WCAG AA)
  - [ ] Check with contrast checker tool
- [ ] **Screen reader support:**
  - [ ] Add aria-label where needed
  - [ ] Hidden elements: aria-hidden="true"
  - [ ] Live regions: aria-live="polite"
  - [ ] Form validation messages announced
- [ ] **ARIA labels:**
  - [ ] Buttons with only icons: aria-label="Description"
  - [ ] Input errors: aria-describedby="errorId"
  - [ ] Modal: aria-modal="true", aria-labelledby="titleId"

### 9.7 Loading & Skeleton States
- [ ] **Loading spinner component:**
  - [ ] Animated circle/spinner
  - [ ] Centered on screen
  - [ ] Loading text optional: "Loading..."
- [ ] **Skeleton loaders:**
  - [ ] Group list skeleton:
    - [ ] 3 placeholder cards
    - [ ] Each card: 60px tall, animated pulse
  - [ ] Transaction list skeleton:
    - [ ] 5 placeholder rows
    - [ ] Each row: fake text lines (animated pulse)
  - [ ] Balance skeleton:
    - [ ] Placeholder for number
- [ ] **Show skeleton when:**
  - [ ] Page loads (before data fetched)
  - [ ] Data refreshing
- [ ] **Hide skeleton when:**
  - [ ] Data loaded from server
  - [ ] Data loaded from IndexedDB

### 9.8 Error States & Empty States
- [ ] **Error message component:**
  - [ ] Red background (light)
  - [ ] Red text
  - [ ] Error icon
  - [ ] Error description
  - [ ] Optional: Retry button
- [ ] **Empty state screens:**
  - [ ] **No groups:**
    - [ ] Illustration/emoji: 📋
    - [ ] Message: "No groups yet"
    - [ ] Call-to-action: "Create a new group" button
  - [ ] **No transactions in group:**
    - [ ] Illustration/emoji: 💰
    - [ ] Message: "No expenses recorded"
    - [ ] Hint: "Add an expense to get started"
    - [ ] Button: "Add Expense"
  - [ ] **No search results:**
    - [ ] Message: "No transactions found"
    - [ ] Hint: "Try different search terms"
    - [ ] Button: "Clear search"
- [ ] **Error detail screens:**
  - [ ] 404 Not Found (group deleted)
  - [ ] 403 Forbidden (no access to group)
  - [ ] 500 Server Error (try again)

### 9.9 Network Status Indicator
- [ ] **Network status UI component:**
  - [ ] Position: Top-right or bottom-left corner
  - [ ] Always visible (high z-index)
  - [ ] **Online state:**
    - [ ] Green dot
    - [ ] "Online" or no label
  - [ ] **Offline state:**
    - [ ] Orange/red dot
    - [ ] "Offline" label
    - [ ] Show sync queue icon (if has pending)
    - [ ] Show count: "5 items pending"
  - [ ] **Syncing state:**
    - [ ] Animated spinner
    - [ ] "Syncing..." label
    - [ ] Show progress: "Syncing 2/10"
  - [ ] **Sync failed state:**
    - [ ] Red dot
    - [ ] "Sync failed" label
    - [ ] "Retry" button
- [ ] **Click to refresh:**
  - [ ] User can tap network indicator to manually sync
  - [ ] Shows loading while syncing
  - [ ] Shows success/failure after

---

## 🔒 PHASE 9B: MONITORING & LOGGING

### 9B.1 Error Tracking Setup (Sentry)
- [ ] Create Sentry project
- [ ] Configure frontend integration:
  - [ ] Install @sentry/react (or @sentry/browser)
  - [ ] Initialize Sentry with DSN
  - [ ] Configure release version
  - [ ] Set environment (dev, staging, production)
  - [ ] Capture unhandled exceptions
  - [ ] Capture console errors
  - [ ] Include breadcrumbs for debugging
- [ ] Configure backend integration:
  - [ ] Install @sentry/node
  - [ ] Initialize Sentry with DSN
  - [ ] Attach error middleware to Express
  - [ ] Capture API errors
  - [ ] Capture database errors
- [ ] Set up Sentry dashboard:
  - [ ] Create alerts for critical errors
  - [ ] Set error rate thresholds (e.g., > 1% = alert)
  - [ ] Configure notifications (email, Slack, etc.)
  - [ ] Set up issue grouping rules

### 9B.2 Performance Monitoring
- [ ] Track frontend metrics:
  - [ ] App load time (target: < 3s)
  - [ ] Expense save time (target: < 200ms)
  - [ ] Sync duration (target: < 3s)
  - [ ] Balance calculation time (target: < 100ms)
  - [ ] Page navigation time
- [ ] Track Core Web Vitals:
  - [ ] LCP (Largest Contentful Paint) < 2.5s
  - [ ] FID (First Input Delay) < 100ms
  - [ ] CLS (Cumulative Layout Shift) < 0.1
- [ ] Create performance monitoring function:
  ```js
  function trackMetric(metricName, duration) {
    Sentry.captureMessage(`Performance: ${metricName} took ${duration}ms`);
  }
  ```
- [ ] Integrate with analytics dashboard (optional)

### 9B.3 Logging Infrastructure
- [ ] **Backend logging (Morgan + Winston):**
  - [ ] Install morgan middleware
  - [ ] Log all API requests: method, route, status, response time
  - [ ] Create custom logger for business logic:
    - [ ] Log group creation
    - [ ] Log transaction creation
    - [ ] Log sync requests
    - [ ] Log errors with stack trace
  - [ ] Log levels: debug, info, warn, error
  - [ ] Write logs to file (optional for production)
- [ ] **Frontend logging:**
  - [ ] Log app lifecycle events:
    - [ ] App initialized
    - [ ] User logged in
    - [ ] Offline/online transitions
    - [ ] Sync started/completed
  - [ ] Log errors with Sentry
  - [ ] Console logs for development (disabled in production)
- [ ] **Log aggregation (optional):**
  - [ ] Send frontend logs to server
  - [ ] Dashboard to view all logs (backend tool)

### 9B.4 Key Metrics & KPIs
- [ ] **Business metrics** (track in analytics dashboard):
  - [ ] Sync success rate (target: > 95%)
  - [ ] UPI click-through rate (target: > 90%)
  - [ ] Offline entries not lost (target: 100%)
  - [ ] Group join success rate (target: 99%)
- [ ] **Technical metrics:**
  - [ ] API response time (target: < 200ms)
  - [ ] Database query time (target: < 100ms)
  - [ ] Error rate (target: < 0.1%)
  - [ ] Sync queue backlog (trend monitoring)
  - [ ] ImageUpload success rate (target: > 98%)
- [ ] **User metrics:**
  - [ ] App load time (target: < 3s)
  - [ ] Expense save time (target: < 200ms)
  - [ ] UI responsiveness (no jank, 60 fps)
  - [ ] Time to complete settlement

### 9B.5 Production Monitoring
- [ ] **Uptime monitoring:**
  - [ ] Use UptimeRobot or Pingdom
  - [ ] Monitor frontend URL
  - [ ] Monitor backend API endpoint
  - [ ] Alert if down for > 5 minutes
- [ ] **Database monitoring:**
  - [ ] MongoDB Atlas metrics (built-in)
  - [ ] Monitor connection pool
  - [ ] Monitor query performance
  - [ ] Alert if connection limit > 80%
  - [ ] Alert if query time > 1s
- [ ] **API monitoring:**
  - [ ] Response time per endpoint
  - [ ] Error rate per endpoint
  - [ ] Rate limit violations
  - [ ] Alert if error rate > 1%
- [ ] **Create monitoring dashboard:**
  - [ ] Real-time system status
  - [ ] Error trends (chart)
  - [ ] Performance trends (chart)
  - [ ] User activity (chart)

---

## 🧪 PHASE 10: TESTING

### 10.1 Frontend Unit Tests
- [ ] Set up Jest + @testing-library/dom
- [ ] Test authentication service:
  - [ ] `sendOTP()` sends correct request
  - [ ] `verifyOTP()` handles success and failure
  - [ ] `login()` stores token locally
  - [ ] `logout()` clears token
- [ ] Test expense service:
  - [ ] `createExpense()` sends correct data
  - [ ] `calculateEqualSplit()` returns correct values
  - [ ] `computeBalances()` accurate calculation
- [ ] Test sync service:
  - [ ] `triggerSync()` fetches pending items
  - [ ] `mergeSyncResponse()` updates local data
  - [ ] `handleSyncError()` sets retry
- [ ] Test UI utility functions:
  - [ ] `generateUPILink()` formats correctly
  - [ ] `compressImage()` reduces file size
  - [ ] `validateUPIID()` accepts valid IDs
- [ ] Aim for 70%+ code coverage

### 10.2 Frontend Integration Tests
- [ ] Test user flows:
  - [ ] Login → Dashboard → Create Group → Add Expense → Settle → Mark Paid
  - [ ] Offline → Create Expense → Online → Sync → Verify
  - [ ] Add expense while offline, update balance
  - [ ] Take receipt photo, upload, verify sync
  - [ ] Scan QR for settlement
- [ ] Test error scenarios:
  - [ ] Network timeout during sync
  - [ ] Duplicate UUID on sync
  - [ ] Camera permission denied
  - [ ] Image upload failure
- [ ] Test offline scenarios:
  - [ ] Disconnect network
  - [ ] Create expense
  - [ ] Reconnect
  - [ ] Verify sync
  - [ ] Verify data integrity

### 10.3 Backend Unit Tests
- [ ] Set up Jest
- [ ] Test authentication:
  - [ ] `registerUser()` validates input
  - [ ] `sendOTP()` generates and stores OTP
  - [ ] `verifyOTP()` checks expiry
  - [ ] `generateToken()` includes userId
  - [ ] `verifyToken()` rejects expired tokens
- [ ] Test business logic:
  - [ ] `computeBalances()` accuracy
  - [ ] `validateSplit()` checks totals
  - [ ] `detectDuplicateUUID()` prevents duplicates
  - [ ] Group auto-archive query
- [ ] Aim for 80%+ code coverage

### 10.4 Backend Integration Tests
- [ ] Test API endpoints:
  - [ ] POST /auth/register + login flow
  - [ ] POST /groups + GET /groups
  - [ ] POST /groups/:id/join
  - [ ] POST /transactions + GET /groups/:id/transactions
  - [ ] POST /sync + conflict resolution
- [ ] Test with actual MongoDB
- [ ] Test authorization:
  - [ ] Non-admin cannot delete group
  - [ ] Cannot access other user's data
  - [ ] Invalid tokens rejected
- [ ] Test error responses:
  - [ ] 400 Bad Request for invalid input
  - [ ] 401 Unauthorized for no token
  - [ ] 403 Forbidden for missing permission
  - [ ] 404 Not Found for missing resource
  - [ ] 409 Conflict for duplicate UUID

### 10.5 E2E Tests (Optional but Recommended)
- [ ] Set up Playwright or Cypress
- [ ] Test complete user journey:
  - [ ] Sign up → Create group → Add expense → Add multiple expenses → Settle → Mark paid
  - [ ] Verify balances at each step
  - [ ] Verify data persists
- [ ] Test offline scenario:
  - [ ] Disable network
  - [ ] Add expense (saved locally)
  - [ ] Enable network
  - [ ] Verify sync and data integrity
- [ ] Test on mobile view:
  - [ ] Set viewport to iPhone size
  - [ ] Test touch interactions
  - [ ] Verify UI responsive
- [ ] Test error recovery:
  - [ ] Network intermittent (on/off)
  - [ ] Server returns error
  - [ ] User cancels action
  - [ ] Retry functions work

### 10.6 Manual Testing Checklist
- [ ] **Authentication:**
  - [ ] Sign up with email/OTP ✓
  - [ ] Login ✓
  - [ ] Logout ✓
  - [ ] Token refresh works ✓
  - [ ] Session persists after refresh ✓
- [ ] **Groups:**
  - [ ] Create group ✓
  - [ ] Join group with code ✓
  - [ ] Leave group ✓
  - [ ] View members ✓
  - [ ] Invite code regenerates (optional) ✓
- [ ] **Expenses:**
  - [ ] Add expense ✓
  - [ ] Choose payer ✓
  - [ ] Equal split ✓
  - [ ] Custom split ✓
  - [ ] View expense detail ✓
  - [ ] Delete expense (admin only) ✓
  - [ ] Attach receipt ✓
- [ ] **Balances:**
  - [ ] Balance computed correctly ✓
  - [ ] Updated after new expense ✓
  - [ ] Updated after payment ✓
  - [ ] Zero after full settlement ✓
- [ ] **Settlement:**
  - [ ] View settlement details ✓
  - [ ] Generate UPI link ✓
  - [ ] Open UPI app ✓
  - [ ] Mark payment as paid ✓
  - [ ] Balance updated after payment ✓
- [ ] **Offline:**
  - [ ] Works without network ✓
  - [ ] Can add expenses offline ✓
  - [ ] Data persists offline ✓
  - [ ] Syncs when reconnected ✓
  - [ ] No data loss ✓
- [ ] **Camera:**
  - [ ] Camera permission prompt ✓
  - [ ] Capture receipt photo ✓
  - [ ] Compress image ✓
  - [ ] Upload to Cloudinary ✓
  - [ ] Receipt displays in expense ✓
  - [ ] Scan QR code (if implemented) ✓
- [ ] **UI/Responsive:**
  - [ ] Desktop layout ✓
  - [ ] Mobile layout ✓
  - [ ] Landscape orientation ✓
  - [ ] All buttons clickable ✓
  - [ ] Network indicator visible ✓
  - [ ] Sync status shown ✓
  - [ ] Error messages clear ✓
- [ ] **Devices / Browsers:**
  - [ ] Chrome Desktop ✓
  - [ ] Chrome Mobile ✓
  - [ ] Safari Mobile ✓
  - [ ] Firefox Desktop ✓
- [ ] **Performance:**
  - [ ] App loads in < 3s ✓
  - [ ] Scrolling smooth ✓
  - [ ] No layout jank ✓
  - [ ] Operations responsive ✓
- [ ] **Data Integrity:**
  - [ ] No duplicate transactions ✓
  - [ ] Balance calculations accurate ✓
  - [ ] Sync doesn't corrupt data ✓
  - [ ] Offline transactions sync correctly ✓

---

## 📱 PHASE 11: PWA & INSTALLATION

### 11.1 Web App Manifest
- [ ] Create manifest.json (`/public/manifest.json`):
  ```json
  {
    "name": "Esplitter - Group Expense Tracker",
    "short_name": "Esplitter",
    "description": "Offline-first group expense splitter with UPI settlement",
    "start_url": "/",
    "display": "standalone",
    "background_color": "#ffffff",
    "theme_color": "#007AFF",
    "scope": "/",
    "orientation": "portrait-primary",
    "icons": [
      {
        "src": "/icon-192.png",
        "sizes": "192x192",
        "type": "image/png"
      },
      {
        "src": "/icon-512.png",
        "sizes": "512x512",
        "type": "image/png"
      }
    ]
  }
  ```
- [ ] Generate app icons:
  - [ ] 192x192 PNG icon
  - [ ] 512x512 PNG icon
  - [ ] 192x192 should be app logo
  - [ ] Both should be high quality
- [ ] Generate Apple icon (optional for iOS):
  - [ ] 180x180 PNG
  - [ ] Add link tag in HTML head
- [ ] Link manifest in index.html `<head>`

### 11.2 Service Worker Configuration
- [ ] Update service worker cache strategy:
  - [ ] Static assets: Cache first (CSS, JS, images)
  - [ ] API calls: Network first with cache fallback
  - [ ] HTML: Network first
- [ ] Implement cache versioning:
  - [ ] Version cache names: v1, v2, etc.
  - [ ] Clean up old cache versions on service worker update
  - [ ] Prompt user to refresh when new version available
- [ ] Handle service worker updates:
  - [ ] Check for new service worker version
  - [ ] If found, show notification: "Update available!"
  - [ ] User can "Refresh now" or "Later"
  - [ ] On refresh, clear cache and reload

### 11.3 PWA Installation Prompt
- [ ] Detect PWA installability:
  - [ ] Check if browser supports PWA
  - [ ] Check if already installed
  - [ ] Check if meets PWA criteria (manifest, service worker, HTTPS)
- [ ] Show custom install prompt:
  - [ ] Only show after 2+ visits or on specific action
  - [ ] Show in banner or modal: "Add Esplitter to your home screen?"
  - [ ] "Install" and "Later" buttons
  - [ ] Track install metrics
- [ ] Handle beforeinstallprompt event:
  - [ ] Save event for later use
  - [ ] Show custom UI when appropriate
  - [ ] Call prompt() on user action

### 11.4 Mobile App-Like Behavior
- [ ] Add viewport meta tag in HTML `<head>`:
  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ```
- [ ] Add theme color meta tag:
  ```html
  <meta name="theme-color" content="#007AFF">
  ```
- [ ] Add Apple-specific meta tags:
  ```html
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Esplitter">
  <link rel="apple-touch-icon" href="/icon-180.png">
  ```
- [ ] Implement back button behavior:
  - [ ] Custom back button (not browser back)
  - [ ] Navigate within app, not reload
  - [ ] Last screen → confirm exit or minimize
- [ ] Disable pinch zoom (optional):
  ```html
  <meta name="viewport" content="... user-scalable=no">
  ```
- [ ] Fullscreen mode (optional):
  - [ ] Hide browser UI (if user installs)
  - [ ] Use navigator.standalone to detect (iOS)

---

## ⚡ PHASE 12: PERFORMANCE OPTIMIZATION

### 12.1 Frontend Performance
- [ ] Code splitting (if using bundler):
  - [ ] Split by route (if using routing)
  - [ ] Lazy load heavy features
- [ ] Implement pagination/infinite scroll:
  - [ ] Limit transactions displayed (50 at a time)
  - [ ] Load more on scroll
  - [ ] Lazy load images
- [ ] Debounce frequent operations:
  - [ ] Search input (300ms debounce)
  - [ ] Window resize (100ms debounce)
  - [ ] Form input changes (200ms debounce)
- [ ] Minimize rerendering:
  - [ ] Update only affected DOM elements
  - [ ] Use requestAnimationFrame for animations
  - [ ] Avoid forcing reflows
- [ ] Cache computed balances:
  - [ ] Compute once per group session
  - [ ] Invalidate on transaction add/delete
  - [ ] Store in memory (AppState)
- [ ] Image optimization:
  - [ ] Serve appropriately sized images
  - [ ] Use WebP where supported
  - [ ] Compress images before upload
  - [ ] Lazy load images on receipt detail
- [ ] Bundle optimization:
  - [ ] Minify CSS and JavaScript
  - [ ] Remove unused CSS (if using CSS frameworks)
  - [ ] Tree shake unused code
  - [ ] Compress assets (gzip)
- [ ] Monitor bundle size:
  - [ ] Target < 200KB initial load
  - [ ] Use bundleanalyzer tool
- [ ] Async/await for non-blocking operations:
  - [ ] Use promises properly
  - [ ] Avoid blocking main thread

### 12.2 Backend Performance
- [ ] Database indexing:
  - [ ] Index on (groupId, createdAt) for transaction queries
  - [ ] Index on groupId for balance computation
  - [ ] Index on (adminId, createdAt) for group queries
  - [ ] Index on inviteCode for join verification
  - [ ] Check MongoDB query plans
- [ ] Lean queries where possible:
  - [ ] Only return needed fields
  - [ ] Example: Transaction list returns: { _id, amount, payer, description, date }
- [ ] Pagination:
  - [ ] Limit results to 50 per page
  - [ ] Default offset 0
  - [ ] Support sort options
- [ ] Query optimization:
  - [ ] Avoid N+1 queries
  - [ ] Batch fetch users for transaction list
  - [ ] Cache frequently accessed data (optional, use Redis)
- [ ] Connection pooling:
  - [ ] Configure MongoDB connection pool (default is fine)
  - [ ] Monitor connection usage
- [ ] Response optimization:
  - [ ] Enable gzip compression (compression middleware)
  - [ ] Minimize JSON response size
  - [ ] Use appropriate status codes

### 12.3 Network Performance
- [ ] Minimize API request size:
  - [ ] Only include necessary fields
  - [ ] Use field projection in MongoDB
- [ ] Batch operations where sensible:
  - [ ] Example: Sync endpoint batches transactions
- [ ] Compress responses (gzip)
  - [ ] Use compression middleware
  - [ ] Enable on server
- [ ] Cache headers:
  - [ ] Static assets: Long cache (1 year)
  - [ ] API responses: No cache or short cache (1 min)
  - [ ] Use ETag for conditional requests
- [ ] CDN for static assets (optional):
  - [ ] Serve images, CSS, JS from CDN
  - [ ] Vercel handles this automatically

### 12.4 Load Time Targets
- [ ] App initial load: < 3 seconds
- [ ] Expense save: < 200ms
- [ ] Sync duration: < 3 seconds
- [ ] Balance calculation: < 100ms
- [ ] API response: < 200ms average, < 500ms p95

### 12.5 Performance Monitoring Setup
- [ ] Frontend metrics:
  - [ ] Use Performance API to measure
  - [ ] Track metrics to Sentry or analytics
  - [ ] Create custom dashboard
- [ ] Backend metrics:
  - [ ] Use Morgan for request timing
  - [ ] Track database query time
  - [ ] Track sync duration
- [ ] User experience metrics:
  - [ ] Core Web Vitals (LCP, FID, CLS)
  - [ ] Monitor with web-vitals library
  - [ ] Send to analytics
- [ ] Set up performance alerts:
  - [ ] Alert if load time > 4 seconds
  - [ ] Alert if API response > 500ms
  - [ ] Alert if error rate > 1%

---

## 🚀 PHASE 13: DEPLOYMENT

### 13.1 Frontend Deployment (Vercel)
- [ ] Build frontend for production:
  - [ ] Run build script (npm run build)
  - [ ] Verify output (usually in `/out` or `/build`)
  - [ ] Check bundle size
- [ ] Set up Vercel project:
  - [ ] Create Vercel account
  - [ ] Connect GitHub repository
  - [ ] Select frontend folder (or root if no folder)
  - [ ] Configure build settings
- [ ] Configure environment variables:
  - [ ] API_URL (backend URL)
  - [ ] SENTRY_DSN (error tracking)
  - [ ] CLOUDINARY_UPLOAD_PRESET
- [ ] Configure custom domain (optional):
  - [ ] Add domain in Vercel
  - [ ] Update DNS records
  - [ ] Verify SSL certificate (auto)
- [ ] Set up automatic deployments:
  - [ ] Deploy on every push to main branch
  - [ ] Create deployment previews on PRs
- [ ] Test deployed frontend:
  - [ ] Check all links work
  - [ ] Verify API calls succeed
  - [ ] Test on mobile
  - [ ] Check service worker registration

### 13.2 Backend Deployment (Render/Railway)
- [ ] Build backend for production:
  - [ ] Ensure all dependencies installed
  - [ ] Update environment variables
  - [ ] Create .env.production file
- [ ] Set up Render/Railway project:
  - [ ] Create account on Render or Railway
  - [ ] Connect GitHub repository
  - [ ] Select backend folder or root
- [ ] Configure environment variables:
  - [ ] DATABASE_URL (MongoDB connection string)
  - [ ] JWT_SECRET (strong random string)
  - [ ] CLOUDINARY_NAME, KEY, SECRET
  - [ ] SENTRY_DSN
  - [ ] NODE_ENV=production
  - [ ] PORT (usually auto-assigned)
- [ ] Configure custom domain (optional):
  - [ ] Add domain in Render/Railway
  - [ ] Update DNS records
  - [ ] SSL certificate auto-generated
- [ ] Set up automatic deployments:
  - [ ] Deploy on push to main branch
  - [ ] Rollback option if needed
- [ ] Test deployed backend:
  - [ ] Test API endpoints with Postman/curl
  - [ ] Verify database connectivity
  - [ ] Check error logging works
  - [ ] Monitor initial startup

### 13.3 MongoDB Atlas Configuration
- [ ] Ensure encryption at rest is enabled
  - [ ] MongoDB Atlas default encryption
- [ ] Configure IP whitelist:
  - [ ] Add Render/Railway server IPs
  - [ ] Add development machine IP
  - [ ] Allow from 0.0.0.0/0 for cloud platforms (not recommended)
- [ ] Set up automated backups:
  - [ ] Enable continuous backups (default)
  - [ ] Retention: 7 days
  - [ ] Test restore process
- [ ] Monitor alerts:
  - [ ] CPU usage
  - [ ] Memory usage
  - [ ] Disk usage
  - [ ] Connection count

### 13.4 Monitoring & Logging Production
- [ ] Set up error tracking (Sentry):
  - [ ] Verify DSN is configured
  - [ ] Test error capture
  - [ ] Set up alerts (email/Slack)
- [ ] Set up uptime monitoring:
  - [ ] Use UptimeRobot, Pingdom, or Render monitoring
  - [ ] Monitor frontend URL
  - [ ] Monitor backend health endpoint
  - [ ] Alert on downtime
- [ ] Set up database monitoring:
  - [ ] MongoDB Atlas metrics
  - [ ] CPU, memory, disk alerts
  - [ ] Connection pool alerts
- [ ] Review logs regularly:
  - [ ] Check error logs daily
  - [ ] Check API response times
  - [ ] Monitor sync failure rates
- [ ] Create runbook for common issues:
  - [ ] Database connection issues
  - [ ] API timeouts
  - [ ] Sync failures
  - [ ] Storage quota exceeded

### 13.5 CI/CD Pipeline (GitHub Actions)
- [ ] Create GitHub Actions workflow:
  - [ ] Trigger on push to main/develop
  - [ ] Lint code (ESLint)
  - [ ] Run tests (Jest)
  - [ ] Build frontend
  - [ ] Build backend
- [ ] Add status checks:
  - [ ] Require all checks to pass before merge
  - [ ] Require approvals on main branch (optional)
- [ ] Deploy on success:
  - [ ] Auto-deploy to Vercel (frontend)
  - [ ] Auto-deploy to Render (backend)
- [ ] Rollback strategy:
  - [ ] Keep previous 5 deployments
  - [ ] Allow manual rollback

---

## 📚 PHASE 14: DOCUMENTATION

### 14.1 Code Documentation
- [ ] JSDoc comments:
  - [ ] All functions: @param, @returns, @description
  - [ ] All classes: @class, @description
  - [ ] Complex logic: Explain algorithm/approach
- [ ] Example for function:
  ```js
  /**
   * Calculates the balance for a user in a group
   * @param {Array} transactions - List of transactions
   * @param {string} userId - User ID to calculate for
   * @returns {number} User's balance (negative = owes, positive = owed)
   */
  function getUserBalance(transactions, userId) { ... }
  ```
- [ ] README files:
  - [ ] /frontend/README.md - Frontend setup and development
  - [ ] /backend/README.md - Backend setup and development
  - [ ] Root README.md - Project overview

### 14.2 User Documentation
- [ ] Create user guide:
  - [ ] Getting started
  - [ ] Creating an account
  - [ ] Creating/joining groups
  - [ ] Adding expenses
  - [ ] Settling payments
  - [ ] Using offline mode
  - [ ] Troubleshooting
- [ ] Create FAQ:
  - [ ] Common questions
  - [ ] Troubleshooting offline sync
  - [ ] UPI payment issues
  - [ ] Account/login issues
  - [ ] Data privacy questions
- [ ] Create tutorials (optional):
  - [ ] Video walkthrough
  - [ ] Step-by-step guides
  - [ ] Screenshots with annotations

### 14.3 Developer Documentation
- [ ] Setup guide:
  - [ ] Frontend setup (clone, install, run)
  - [ ] Backend setup (clone, install, configure, run)
  - [ ] Database setup (MongoDB Atlas)
  - [ ] Environment variables
- [ ] API documentation:
  - [ ] List all endpoints
  - [ ] Example requests/responses
  - [ ] Authentication requirements
  - [ ] Error codes
  - [ ] Rate limits
- [ ] Database schema documentation:
  - [ ] User schema with field descriptions
  - [ ] Group schema with field descriptions
  - [ ] Transaction schema with field descriptions
  - [ ] Indexes
- [ ] Testing guide:
  - [ ] How to run unit tests
  - [ ] How to run integration tests
  - [ ] How to run E2E tests
  - [ ] Code coverage targets
- [ ] Deployment guide:
  - [ ] Frontend deployment steps
  - [ ] Backend deployment steps
  - [ ] Environment variable configuration
  - [ ] Monitoring setup
  - [ ] Rollback procedure
- [ ] Troubleshooting guide:
  - [ ] Common issues and solutions
  - [ ] Log locations
  - [ ] Debug mode
  - [ ] Performance profiling

### 14.4 Architecture Documentation
- [ ] System architecture overview:
  - [ ] High-level architecture diagram
  - [ ] Frontend, backend, database, external services
- [ ] Frontend architecture:
  - [ ] Component structure
  - [ ] State management
  - [ ] Service layer
  - [ ] Database layer (IndexedDB)
  - [ ] Sync mechanism flow diagram
- [ ] Backend architecture:
  - [ ] API routes
  - [ ] Controllers/business logic
  - [ ] Database models
  - [ ] Middleware
  - [ ] External integrations
- [ ] Data model documentation:
  - [ ] ER diagrams
  - [ ] Field descriptions
  - [ ] Relationships
  - [ ] Indexes
- [ ] Design decisions document:
  - [ ] Why offline-first approach
  - [ ] Why IndexedDB vs LocalStorage
  - [ ] Why ledger model vs account model
  - [ ] Trade-offs and alternatives considered

---

## 🎯 PHASE 15: ENHANCEMENTS & POLISH

### 15.1 User Experience Improvements
- [ ] Implement undo for accidental deletions:
  - [ ] Show undo notification after delete
  - [ ] 10-second window to undo
  - [ ] Store deleted item temporarily
  - [ ] Restore on undo click
- [ ] Add transaction search/filter:
  - [ ] Search by description
  - [ ] Filter by date range
  - [ ] Filter by amount range
  - [ ] Filter by payer
  - [ ] Save favorite filters (optional)
- [ ] Add expense categories (optional):
  - [ ] Category selection in create expense
  - [ ] Filter by category
  - [ ] Category-based analytics
- [ ] Add spending analytics/charts:
  - [ ] Pie chart: Expenses by category or person
  - [ ] Bar chart: Monthly spending trend
  - [ ] Line chart: Group balance over time
  - [ ] Summary stats: Total spent, avg per person
- [ ] Implement profile customization:
  - [ ] Display name
  - [ ] Profile picture (avatar)
  - [ ] Bio/About section
- [ ] Add user preferences/settings:
  - [ ] Currency preference (INR, USD, etc.)
  - [ ] Date format (DD/MM/YYYY, MM/DD/YYYY)
  - [ ] Time zone
  - [ ] Language (optional)
  - [ ] Dark mode (optional)
- [ ] Add notification preferences:
  - [ ] Email notifications for settlements
  - [ ] Push notifications (PWA)
  - [ ] Notification frequency
  - [ ] Opt-in/opt-out

### 15.2 Feature Enhancements
- [ ] Implement group expense templates:
  - [ ] Save common expense setups
  - [ ] QuickAdd button to reuse template
  - [ ] Edit expense after quick-add
- [ ] Add recurring expenses (optional):
  - [ ] Set up monthly recurring expenses
  - [ ] Auto-create on schedule
  - [ ] Manual confirmation required
  - [ ] Skip/Modify upcoming occurrence
- [ ] Add split history/audit log:
  - [ ] View all changes to a transaction
  - [ ] See who made changes and when
  - [ ] Optional: Restore previous version
- [ ] Implement expense notes/comments:
  - [ ] Add notes to transactions
  - [ ] Edit notes (with history)
  - [ ] Private notes (only visible to admin)
- [ ] Add expense approval workflow (optional):
  - [ ] Admin must approve large expenses
  - [ ] Notification for pending approvals
  - [ ] Approve/Reject/Comment
- [ ] Implement expense budgets per group:
  - [ ] Set monthly budget
  - [ ] Track progress with visual indicator
  - [ ] Alert when approaching limit (80%, 100%)
- [ ] **Graph-based debt visualization:**
  - [ ] Visualize who owes whom
  - [ ] Show settlement graph/diagram
  - [ ] Highlight circular debts (A→B→C→A)
  - [ ] Suggest optimal settlement path
  - [ ] Example: Instead of A→C and C→B, show A→B

### 15.3 Advanced Features (Optional - Phase 2 Expansion)
- [ ] **Multi-currency support:**
  - [ ] User selects currency
  - [ ] Auto currency conversion (using exchange rate API)
  - [ ] Display in user's preferred currency
  - [ ] Backend stores in single currency (INR/USD)
- [ ] **Integration with payment gateways:**
  - [ ] Razorpay integration (direct payment processing)
  - [ ] PayPal integration (alternative)
  - [ ] Direct payment processing (not just links)
  - [ ] Payment status webhook
- [ ] **SMS/Email notifications:**
  - [ ] Settlement reminders via SMS
  - [ ] Expense notifications via Email
  - [ ] Daily/Weekly digest emails
- [ ] **Scheduled expense reminders:**
  - [ ] Remind about unsettled balances
  - [ ] Recurring expense notifications
  - [ ] Customizable frequency
- [ ] **Integration with calendar events:**
  - [ ] Auto-create groups for trips/events
  - [ ] Sync with Google Calendar/Outlook
  - [ ] Auto-close group on event end date
- [ ] **In-app messaging/chatting:**
  - [ ] Message other group members
  - [ ] Notification on new message
  - [ ] Message history
  - [ ] Optional: Video/audio call buttons
- [ ] **Mobile app (React Native or Flutter):**
  - [ ] Phase 2 expansion: Native iOS/Android app
  - [ ] Share code/logic with web where possible
  - [ ] Better offline support (local database)
  - [ ] Push notifications
  - [ ] Easier payment integration
- [ ] **Smart settlement optimization:**
  - [ ] Algorithm to minimize transactions needed for settlement
  - [ ] Example: If A owes B 100 and B owes C 100, suggest A pays C directly
  - [ ] Suggest optimal payment order
  - [ ] Visualize settlement path
- [ ] **WebSocket real-time updates (optional):**
  - [ ] Real-time balance updates across devices
  - [ ] Real-time notification of new expenses
  - [ ] Live group sync (no manual refresh)
  - [ ] Requires server upgrade (Socket.io or similar)

### 15.4 Social Features (Optional)
- [ ] **User profiles:**
  - [ ] Public profile pages (name, avatar, bio)
  - [ ] View user's group participation
- [ ] **Friend list:**
  - [ ] Add/remove friends
  - [ ] Quick group creation with friends
  - [ ] Friend activity feed
- [ ] **Direct payments between friends:**
  - [ ] Send money directly to friend (outside groups)
  - [ ] Settlement with UPI
- [ ] **Group sharing/invitations via social media:**
  - [ ] Share invite link on WhatsApp, SMS, etc.
  - [ ] Track who invited whom
- [ ] **Activity feed:**
  - [ ] View activity in groups
  - [ ] Notifications for updates
- [ ] **Leaderboards/statistics:**
  - [ ] Who spent most this month
  - [ ] Who owes most
  - [ ] Group statistics

### 15.5 Admin Features (Optional)
- [ ] **Admin dashboard:**
  - [ ] Overview of system statistics
  - [ ] User management (view, disable users)
  - [ ] Group management (view, archive, delete)
  - [ ] Transaction monitoring
- [ ] **User analytics:**
  - [ ] Active users over time
  - [ ] User engagement metrics
  - [ ] Retention analysis
- [ ] **Group analytics:**
  - [ ] Most active groups
  - [ ] Average group size
  - [ ] Average transaction amount
- [ ] **Moderation tools:**
  - [ ] Suspend/ban users
  - [ ] Delete inappropriate content
  - [ ] Report management
- [ ] **System health monitoring:**
  - [ ] Real-time database status
  - [ ] API health
  - [ ] Error monitoring
  - [ ] Performance metrics

---

## ⚠️ KNOWN CONSTRAINTS, LIMITATIONS & RISKS

### Technical Constraints
- [ ] UPI payment callback unreliable (manual confirmation required)
- [ ] PWA installation varies by browser
- [ ] iOS Safari limited PWA support (no home screen install, limited service worker)
- [ ] IndexedDB storage limited (~50MB per domain in most browsers)
- [ ] Background sync not supported on all browsers
- [ ] Service Worker requires HTTPS
- [ ] Camera access requires HTTPS
- [ ] Safari on iOS doesn't support Service Workers properly

### Known Risks & Mitigations
- [ ] Browser clears IndexedDB → Warn users, provide export data option
- [ ] Sync conflicts → UUID deduplication, last-write-wins strategy
- [ ] Payment verification unreliable → Manual user confirmation required
- [ ] Service Worker unsupported → Fallback to manual sync on page reload
- [ ] Storage quota exceeded → Limit receipt images to 2MB max
- [ ] UPI app not installed on mobile → Show deep link as text/copy option
- [ ] Permission denied for camera → Progressive fallback, allow manual entry
- [ ] Desktop Chrome doesn't support UPI deep links → Show copyable link instead
- [ ] OTP timeout → Clear OTP, require resend
- [ ] Multiple concurrent syncs → Lock mechanism, queue syncs sequentially
- [ ] Network intermittent (on/off rapidly) → Debounce sync triggers

### Business Constraints
- [ ] No native app (web only, limits iOS experience)
- [ ] No SMS API integration (only email for OTP)
- [ ] No actual payment processing (only deep links/UPI)
- [ ] Limited to Chrome as primary target (other browsers partial support)
- [ ] Max group size recommended: 20 members
- [ ] Max transactions per group: 10,000 (before performance degrades)

### Design Constraints
- [ ] Max receipt image size: 2MB
- [ ] Max description length: 200 characters
- [ ] UPI ID format limited to standard UPI patterns
- [ ] Transactions immutable once synced (no edits, only metadata updates)

---

## 🎯 SUCCESS CRITERIA

**Core Features (MVP):**
- [ ] Users can create secure accounts and log in (OTP or password)
- [ ] Users can create and join groups with invite codes
- [ ] Users can add expenses offline with full data persistence
- [ ] Expenses are properly split among group members
- [ ] Balances are accurately computed in real-time
- [ ] Offline data syncs reliably when online (> 95% success)
- [ ] UPI links generate correctly and open UPI app on mobile
- [ ] Receipt images can be captured, compressed, and uploaded
- [ ] QR codes can capture receipts and UPI payments

**Authentication & Security:**
- [ ] All users have unique accounts
- [ ] Passwords secure (if password auth) or OTP validated
- [ ] No critical security vulnerabilities identified
- [ ] Rate limiting prevents brute force attacks
- [ ] All data transmitted over HTTPS

**Performance & Reliability:**
- [ ] App loads in < 3 seconds (target)
- [ ] Expense save completes in < 200ms (target)
- [ ] Sync duration < 3 seconds (target)
- [ ] Balance computation < 100ms (target)
- [ ] Sync success rate > 95%
- [ ] Offline entries never lost (100% data persistence)
- [ ] No data corruption after sync

**UX & Accessibility:**
- [ ] App works responsively on mobile and desktop (Chrome primary)
- [ ] Network status indicator always visible
- [ ] Clear feedback for all user actions
- [ ] Keyboard accessible (Tab navigation works)
- [ ] Intuitive UI/UX (user can complete workflows without help)
- [ ] Error messages are clear and actionable

**Deployment & Monitoring:**
- [ ] All unit tests pass (70%+ frontend, 80%+ backend coverage)
- [ ] All integration tests pass
- [ ] All E2E tests pass
- [ ] Deployment works smoothly (both frontend and backend)
- [ ] Error tracking (Sentry) configured and working
- [ ] Performance metrics monitored
- [ ] No data loss in production

**User Experience:**
- [ ] Users report intuitive interface
- [ ] Users can complete all core workflows (create group → expense → settle)
- [ ] Offline mode seamlessly transitions to online
- [ ] Settlement process is straightforward

---

## 📝 CRITICAL DECISIONS & TIMELINE

### Key Decision Points (Must Decide Before Starting):
1. **Authentication Method** (Beginning of Phase 2)
   - [ ] **DECIDE:** Password-based with bcrypt OR Password-less OTP (Email/SMS)?
   - **Impact:** Changes Phase 2 implementation, frontend/backend logic, API endpoints
   - **Recommendation:** Passwordless OTP (per PRD requirement) is more user-friendly but requires email/SMS setup
   - **Decision: ___________________________**

2. **Development Timeline** (Estimate realistic dates)
   - [ ] Phase 1-2 (Foundation + Auth): ____ weeks
   - [ ] Phase 3-5 (Groups + Expenses): ____ weeks
   - [ ] Phase 6-8 (Sync + Payments + UX): ____ weeks
   - [ ] Phase 9-12 (Testing + Deployment): ____ weeks
   - [ ] **Total Estimated Duration: _____ months**

### Implementation Notes & Best Practices:
- Start with Phase 1 and Phase 2 for solid foundation
- **Must decide authentication by end of Phase 2.1 or project will be blocked**
- Core feature phases (3-8) are the MVP
- Phase 9-10 (security, testing) are essential before launch
- Phase 9B (monitoring) should be setup during development (not after)
- Phase 11-14 are essential before launch
- Phase 15 is for post-launch improvements and scaling

### Testing Strategy:
- Regularly test on actual devices, not just browser emulation
- Document every test case executed
- Get early user feedback once Phase 3-4 features are ready
- Consider hiring external testers for UAT before launch

### Technical Notes:
- Always test offline scenarios: disconnect → create expense → reconnect → verify sync
- Pay special attention to UUID deduplication in sync mechanism
- Test with multiple concurrent users (if possible)
- Profile IndexedDB queries for large transaction lists (1000+ transactions)
- Monitor service worker caching effectiveness
- Test image upload with slow 3G network
- Test camera permissions on both iOS and Android
- Test UPI deep links on actual phones (not emulators)

### QA Testing Checklist (Full Device Coverage):
- [ ] Chrome Desktop (Windows/Mac/Linux)
- [ ] Chrome Mobile (Android)
- [ ] Safari Mobile (iOS) - Limited support expected
- [ ] Firefox Desktop (optional)
- [ ] Offline mode (airplane mode)
- [ ] Network throttling (3G, 4G, WiFi)
- [ ] With 50+ transactions per group
- [ ] With 10+ group members
- [ ] Rapid consecutive actions (to test debouncing/race conditions)
- [ ] Browser restart (persistence test)
- [ ] IndexedDB cleared (data loss warning)
- [ ] Low storage scenarios (quota exceeded)
- [ ] Concurrent multiuser scenarios (if possible)

### Deployment Readiness Checklist:
- [ ] HTTPS enabled on both frontend and backend
- [ ] Environment variables configured on all platforms
- [ ] Database credentials secured and encrypted
- [ ] API rate limiting configured and tested
- [ ] CORS configured correctly and tested
- [ ] Error tracking (Sentry) connected and tested
- [ ] Monitoring dashboard accessible
- [ ] Backup strategy for MongoDB Atlas configured
- [ ] Backup restore process tested
- [ ] CDN configured (optional, Vercel has built-in)
- [ ] Custom domain configured (optional)
- [ ] SSL certificates auto-renewed
- [ ] Rollback procedure documented and tested
- [ ] Incident response plan documented

---

**Last Updated:** February 14, 2026  
**Project Status:** Ready for Development  
**Next Steps:** Review document, make key decisions, start Phase 1
