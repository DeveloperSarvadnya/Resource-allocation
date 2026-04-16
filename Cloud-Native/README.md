# AI-Driven Cloud-Native Shared Resource Scheduling & Predictive Conflict Optimization System
## Backend Documentation

---

## 1. Backend Architecture

```
Request → Express Router → Auth Middleware → Authorize Middleware
       → express-validator → Controller → Sequelize (Transaction)
       → Supabase PostgreSQL → Response
                            ↘ errorHandler (centralized)
```

**Key design decisions:**
- All times stored as UTC (`TIMESTAMPTZ`) in Postgres; converted per user timezone at app layer using **Luxon**
- Conflict detection uses a two-phase check: exact/partial overlap via SQL, then recurring schedule expansion in memory
- Every booking mutation wraps `Schedule` + `BookingHistory` in a single Sequelize transaction
- Roles are hierarchical: `admin > manager > user`

---

## 2. Folder Structure

```
scheduler-backend/
├── server.js                  ← entry point
├── package.json
├── .env                       ← copy from .env.example
├── schema.sql                 ← run once in Supabase SQL editor
│
├── config/
│   └── database.js            ← Sequelize + Supabase SSL config
│
├── models/
│   ├── index.js               ← associations
│   ├── User.js
│   ├── Resource.js
│   ├── Schedule.js
│   ├── RecurringSchedule.js
│   └── BookingHistory.js
│
├── middleware/
│   ├── authenticate.js        ← JWT verification
│   ├── authorize.js           ← role-based guard factory
│   ├── validate.js            ← express-validator runner
│   └── errorHandler.js        ← centralized error handler
│
├── controllers/
│   ├── authController.js
│   ├── resourceController.js
│   └── scheduleController.js
│
├── routes/
│   ├── authRoutes.js
│   ├── resourceRoutes.js
│   └── scheduleRoutes.js
│
├── validators/
│   ├── authValidators.js
│   ├── resourceValidators.js
│   └── scheduleValidators.js
│
└── utils/
    ├── conflictDetector.js    ← overlap + recurring conflict logic
    └── AppError.js            ← custom error class
```

---

## 3. Supabase SQL Schema

> See `schema.sql` in the project root. Paste into **Supabase Dashboard → SQL Editor → New Query** and run it.

Tables created:
| Table | Purpose |
|---|---|
| `users` | Auth + role + timezone preference |
| `resources` | Bookable assets (rooms, equipment, etc.) |
| `schedules` | Individual confirmed/cancelled bookings |
| `recurring_schedules` | Repeating booking templates |
| `booking_history` | Immutable audit trail of every status change |

---

## 4. .env Setup

Copy `.env.example` → `.env` and fill in your values:

```env
PORT=3000
NODE_ENV=development

DB_HOST=db.xxxxxxxxxxxxxxxxxxxx.supabase.co
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=your_supabase_db_password

JWT_SECRET=replace_with_a_long_random_secret_min_32_chars
JWT_EXPIRES_IN=7d

APP_TIMEZONE=America/New_York
```

---

## 5. How to Set Up Supabase

1. Go to https://supabase.com and create a **free account**
2. Create a new **Project** (choose any region)
3. Wait ~2 min for provisioning
4. Go to **Project Settings → Database**
5. Copy:
   - **Host** → `DB_HOST`
   - **Password** (set during project creation) → `DB_PASSWORD`
   - Port is always `5432`
6. Go to **SQL Editor → New Query**
7. Paste the entire contents of `schema.sql` and click **Run**
8. Verify tables appear in **Table Editor**

> **Important:** Disable Row Level Security (RLS) on all tables OR add permissive policies, because Sequelize connects as the `postgres` superuser via the direct connection string.

To disable RLS quickly (run in SQL Editor):
```sql
ALTER TABLE users             DISABLE ROW LEVEL SECURITY;
ALTER TABLE resources         DISABLE ROW LEVEL SECURITY;
ALTER TABLE schedules         DISABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_schedules DISABLE ROW LEVEL SECURITY;
ALTER TABLE booking_history   DISABLE ROW LEVEL SECURITY;
```

---

## 6. How to Connect Backend to Supabase

Supabase exposes a standard **PostgreSQL** connection. The `config/database.js` connects via:
- `pg` driver (Sequelize dialect: postgres)
- SSL enabled with `rejectUnauthorized: false` (required for Supabase)
- All credentials come from `.env`

No Supabase-specific SDK is used — just plain Postgres.

---

## 7. Commands to Run Backend on macOS (MacBook Air M4)

```bash
# 1. Navigate to project
cd scheduler-backend

# 2. Install dependencies
npm install

# 3. Copy and fill in env
cp .env.example .env
# Edit .env with your Supabase credentials and JWT secret

# 4. Run schema in Supabase SQL Editor (one-time setup)
# paste schema.sql contents → run

# 5. Start development server (with auto-reload)
npm run dev

# OR start production server
npm start
```

Server will be available at: **http://localhost:3000**

---

## 8. Complete API Reference

### Base URL
```
http://localhost:3000/api
```

### Authentication
All protected routes require:
```
Authorization: Bearer <token>
```

---

### Auth Endpoints

#### Register
```
POST /api/auth/register
Content-Type: application/json

{
  "name": "Alice Admin",
  "email": "alice@example.com",
  "password": "securepass123",
  "role": "admin",           // "admin" | "manager" | "user"
  "timezone": "America/New_York"
}

Response 201:
{
  "token": "eyJhbGci...",
  "user": { "id": "uuid", "name": "Alice Admin", "email": "...", "role": "admin" }
}
```

#### Login
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "alice@example.com",
  "password": "securepass123"
}

Response 200:
{ "token": "eyJhbGci...", "user": { ... } }
```

#### Get Current User
```
GET /api/auth/me
Authorization: Bearer <token>

Response 200:
{ "user": { "id": "...", "name": "...", "role": "admin", ... } }
```

---

### Resource Endpoints (Admin-only mutations)

#### List Resources
```
GET /api/resources
Authorization: Bearer <token>
```

#### Get Resource
```
GET /api/resources/:id
Authorization: Bearer <token>
```

#### Create Resource  ← Admin only
```
POST /api/resources
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "name": "Conference Room A",
  "description": "10-person boardroom",
  "capacity": 10,
  "location": "Floor 3, East Wing"
}
```

#### Update Resource  ← Admin only
```
PUT /api/resources/:id
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "name": "Conference Room A (Renamed)",
  "capacity": 12,
  "isActive": true
}
```

#### Deactivate Resource  ← Admin only
```
DELETE /api/resources/:id
Authorization: Bearer <admin-token>
```

---

### Schedule Endpoints

#### List Schedules
```
GET /api/schedules
Authorization: Bearer <token>
// Admin/Manager: all schedules
// User: own schedules only
```

#### Get Schedule (with history)
```
GET /api/schedules/:id
Authorization: Bearer <token>
```

#### Create Booking  ← All authenticated roles
```
POST /api/schedules
Authorization: Bearer <token>
Content-Type: application/json

{
  "resourceId": "uuid-of-resource",
  "title": "Sprint Planning Meeting",
  "startTime": "2026-03-15T09:00:00-05:00",
  "endTime":   "2026-03-15T11:00:00-05:00",
  "notes": "Q2 kickoff"
}

// Success 201: { "data": { schedule } }
// Conflict 409: {
//   "error": "Time slot conflicts with an existing booking",
//   "details": { "conflicts": [...] }
// }
// Past time 422: { "error": "Cannot book a time slot in the past" }
```

#### Update Booking
```
PUT /api/schedules/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Updated Title",
  "startTime": "2026-03-15T10:00:00-05:00",
  "endTime":   "2026-03-15T12:00:00-05:00"
}
```

#### Cancel Booking
```
DELETE /api/schedules/:id
Authorization: Bearer <token>
```

---

### Recurring Schedule Endpoints  ← Admin / Manager only

#### Create Recurring Schedule
```
POST /api/schedules/recurring
Authorization: Bearer <admin-or-manager-token>
Content-Type: application/json

// Weekly example (every Tuesday)
{
  "resourceId": "uuid-of-resource",
  "title": "Weekly Standup",
  "frequency": "weekly",
  "dayOfWeek": 2,           // 0=Sun, 1=Mon, 2=Tue ...
  "startTime": "09:00",
  "endTime":   "09:30",
  "recurStart": "2026-03-01",
  "recurEnd":   "2026-12-31",
  "timezone":   "America/New_York"
}

// Daily example
{
  "resourceId": "uuid",
  "title": "Daily Lab Booking",
  "frequency": "daily",
  "startTime": "08:00",
  "endTime": "09:00",
  "recurStart": "2026-03-01",
  "timezone": "UTC"
}

// Monthly example (every 15th)
{
  "resourceId": "uuid",
  "title": "Monthly Review",
  "frequency": "monthly",
  "dayOfMonth": 15,
  "startTime": "14:00",
  "endTime": "15:00",
  "recurStart": "2026-03-01"
}
```

#### List Recurring Schedules
```
GET /api/schedules/recurring
Authorization: Bearer <admin-or-manager-token>
```

---

## 9. Example Postman Requests

Import this flow into Postman:

**Step 1 — Register admin:**
```
POST http://localhost:3000/api/auth/register
Body (raw JSON):
{
  "name": "System Admin",
  "email": "admin@company.com",
  "password": "Admin@1234",
  "role": "admin"
}
→ Copy the "token" from response
```

**Step 2 — Create a resource (use admin token):**
```
POST http://localhost:3000/api/resources
Header: Authorization: Bearer <admin-token>
Body:
{
  "name": "Lab Room 101",
  "capacity": 8,
  "location": "Building B"
}
→ Copy the "id" from response
```

**Step 3 — Book the resource:**
```
POST http://localhost:3000/api/schedules
Header: Authorization: Bearer <admin-token>
Body:
{
  "resourceId": "<resource-id>",
  "title": "Chemistry Lab Session",
  "startTime": "2026-04-01T09:00:00Z",
  "endTime":   "2026-04-01T11:00:00Z"
}
```

**Step 4 — Try a conflicting booking (should get 409):**
```
POST http://localhost:3000/api/schedules
Body:
{
  "resourceId": "<same-resource-id>",
  "title": "Physics Lab",
  "startTime": "2026-04-01T10:00:00Z",
  "endTime":   "2026-04-01T12:00:00Z"
}
→ 409 Conflict with details
```

**Step 5 — Try a past booking (should get 422):**
```
POST http://localhost:3000/api/schedules
Body:
{
  "resourceId": "<resource-id>",
  "title": "Old meeting",
  "startTime": "2024-01-01T09:00:00Z",
  "endTime":   "2024-01-01T10:00:00Z"
}
→ 422 Cannot book a time slot in the past
```

---

## 10. Testing Steps

```bash
# 1. Start the server
npm run dev

# 2. Health check
curl http://localhost:3000/health

# 3. Register admin
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","email":"admin@test.com","password":"Admin@1234","role":"admin"}' | jq .

# 4. Save token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"Admin@1234"}' | jq -r '.token')
echo "Token: $TOKEN"

# 5. Create resource
RESOURCE_ID=$(curl -s -X POST http://localhost:3000/api/resources \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Room A","capacity":10,"location":"Floor 1"}' | jq -r '.data.id')
echo "Resource: $RESOURCE_ID"

# 6. Create schedule
curl -s -X POST http://localhost:3000/api/schedules \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"resourceId\":\"$RESOURCE_ID\",\"title\":\"Team Sync\",\"startTime\":\"2026-06-01T10:00:00Z\",\"endTime\":\"2026-06-01T11:00:00Z\"}" | jq .

# 7. Test conflict (overlapping time)
curl -s -X POST http://localhost:3000/api/schedules \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"resourceId\":\"$RESOURCE_ID\",\"title\":\"Overlapping Meeting\",\"startTime\":\"2026-06-01T10:30:00Z\",\"endTime\":\"2026-06-01T11:30:00Z\"}" | jq .

# 8. Test past booking rejection
curl -s -X POST http://localhost:3000/api/schedules \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"resourceId\":\"$RESOURCE_ID\",\"title\":\"Past\",\"startTime\":\"2020-01-01T10:00:00Z\",\"endTime\":\"2020-01-01T11:00:00Z\"}" | jq .

# 9. List all schedules
curl -s http://localhost:3000/api/schedules \
  -H "Authorization: Bearer $TOKEN" | jq .

# 10. Cancel schedule
SCHEDULE_ID=$(curl -s http://localhost:3000/api/schedules \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data[0].id')
curl -s -X DELETE "http://localhost:3000/api/schedules/$SCHEDULE_ID" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

---

## 11. Frontend Integration Guide

### Base URL
```
http://localhost:3000/api
```
In production, replace with your deployed server URL.

### What the frontend must do:
1. Store the JWT token after login (e.g., localStorage or memory)
2. Send `Authorization: Bearer <token>` header on every protected request
3. Send all datetimes as **ISO 8601 with timezone offset** (e.g., `2026-04-01T09:00:00-05:00` or `2026-04-01T14:00:00Z`)
4. Handle these HTTP status codes:
   - `200/201` → success
   - `400` → validation error (show `details` array)
   - `401` → redirect to login
   - `403` → show "Access denied"
   - `409` → show conflict details (`details.conflicts` or `details.recurringConflicts`)
   - `422` → business rule violation (past booking, end before start)
   - `500` → generic error

### Endpoints consumed by frontend:

| Feature | Method | URL |
|---|---|---|
| Register | POST | `/api/auth/register` |
| Login | POST | `/api/auth/login` |
| Current user | GET | `/api/auth/me` |
| List resources | GET | `/api/resources` |
| Get resource | GET | `/api/resources/:id` |
| Create resource | POST | `/api/resources` |
| Update resource | PUT | `/api/resources/:id` |
| Delete resource | DELETE | `/api/resources/:id` |
| List schedules | GET | `/api/schedules` |
| Get schedule | GET | `/api/schedules/:id` |
| Book resource | POST | `/api/schedules` |
| Update booking | PUT | `/api/schedules/:id` |
| Cancel booking | DELETE | `/api/schedules/:id` |
| List recurring | GET | `/api/schedules/recurring` |
| Create recurring | POST | `/api/schedules/recurring` |
