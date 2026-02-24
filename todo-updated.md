🔹 PHASE 1 — Basic Setup (Must Work)
Backend (Node + Express + MongoDB)

 Express server running

 MongoDB Atlas connected

 Basic folder structure (models, routes, middleware)

 CORS enabled

 Environment variables working

 JWT middleware working

🔹 PHASE 2 — Authentication (Simple & Working)

Use your existing password-based auth (already partially done).

Backend

 User schema
{ name, email (unique), passwordHash }

 Register route

 Login route

 Password hashed with bcrypt

 JWT token generation

 Protect routes with auth middleware

Frontend

 Login page

 Register page

 Store token in localStorage

 Redirect after login

 Logout button

❌ Skip:

OTP

Refresh tokens

Rate limiting

Password strength meter

🔹 PHASE 3 — Groups (Core Feature)
Backend

 Group schema
{ name, members: [userId], createdBy }

 Create group

 Get my groups

 Join group (by group ID or simple invite code)

 Middleware: only members can access group

Frontend

 Dashboard showing groups

 Create group form

 Join group form

 Click group → go to group page

❌ Skip:

Auto archive

Admin permissions

Invite code regeneration

Member removal

Scheduled jobs

🔹 PHASE 4 — Expenses (Main Logic)

This is your most important part.

Backend

Transaction schema:

{
  groupId,
  amount,
  description,
  paidBy,
  splits: [{ userId, amount }],
  createdAt
}

Routes:

 Add expense

 Get group expenses

 Delete expense (optional)

Validation:

 Amount > 0

 Splits total = amount

 Users belong to group

Frontend

 Add Expense form:

Amount

Description

Paid by

Equal split only (IMPORTANT: start with equal split only)

 Show expense list

 Show who paid what

 Show each person’s share

❌ Skip:

Custom split

Percentage split

Receipt upload

Camera

QR

Cloudinary

Equal split is enough for college demo.

🔹 PHASE 5 — Balance Calculation (CRITICAL FOR DEMO)

You must show:

“A owes B ₹500”

Simple Balance Algorithm

For each expense:

Add full amount to payer

Subtract share from each participant

Final result:

{
  user1: +500,
  user2: -300,
  user3: -200
}
Backend

 Create /groups/:id/balance route

 Compute balances server-side

OR

Frontend

 Compute balances from expense list (simpler)

✔ Recommended for college:
Compute balances on frontend.

🔹 PHASE 6 — Settlement (Basic Version)

Keep it VERY simple.

Frontend only:

 Show balances

 If user balance < 0 → show:
“You owe ₹X”

 If user balance > 0 → show:
“You are owed ₹X”

Optional:

 Add simple “Mark as Settled” button that creates PAYMENT transaction

❌ Skip:

UPI deep links

QR codes

Payment apps

Optimization algorithm

🔹 PHASE 7 — Basic UI Cleanup

 Clean layout

 Responsive for mobile

 Proper error messages

 Loading indicators

 Empty states

❌ Skip:

Advanced animations

Accessibility audits

Skeleton loaders

PWA install

Service worker

🔹 OPTIONAL (Only If Time Left)

If you finish early:

 Custom split

 Basic offline support (localStorage only, not IndexedDB)

 Simple receipt upload (store base64 in DB)

 Basic settlement optimization

🎯 What Your College Evaluator Actually Cares About

They will test:

Can I register/login?

Can I create group?

Can 2 users join?

Can they add expense?

Is split correct?

Is balance correct?

Does it look clean?

Does it crash?

They will NOT test:

Conflict resolution

Exponential backoff

Monitoring dashboards

Production logging

Multi-device sync

PWA installation

Advanced payments

🧠 Minimal Architecture for College Version

Frontend:

Vanilla JS (or your current setup)

Fetch API

Local state

Basic routing

Backend:

Express

MongoDB

Mongoose

JWT auth

That’s it.

⏳ Realistic Timeline (Student Speed)

If focused:

Auth: 2–3 days

Groups: 2 days

Expenses: 3–4 days

Balance logic: 2 days

UI polish: 2–3 days

Total: ~2 weeks part-time work

🚀 Final Minimal MVP Checklist

You are DONE when:

 User can login

 User can create group

 3 users can join

 Add ₹300 expense split equally

 Correct balances shown

 UI clean

 No console errors

 Deployed on Render/Vercel