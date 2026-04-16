# ResourceFlow — Frontend Setup Guide
## AI-Driven Cloud-Native Shared Resource Scheduling System

---

## Prerequisites
- Node.js installed (check: `node --version`)
- Backend already running on `http://localhost:3000`

---

## Step 1 — Open Terminal and Navigate

```bash
cd ~/Documents
```

---

## Step 2 — Create Frontend Folder and Enter It

```bash
mkdir scheduler-frontend
cd scheduler-frontend
```

---

## Step 3 — Copy All Frontend Files

Place all the files you downloaded into this `scheduler-frontend` folder.
The structure should look like:

```
scheduler-frontend/
├── package.json
├── vite.config.js
├── index.html
├── FRONTEND_GUIDE.md
└── src/
    ├── main.jsx
    ├── index.css
    ├── App.jsx
    ├── context/
    │   └── AuthContext.jsx
    ├── services/
    │   └── api.js
    ├── components/
    │   ├── layout/
    │   │   ├── Layout.jsx
    │   │   └── Layout.css
    │   └── ui/
    │       └── index.css
    └── pages/
        ├── LoginPage.jsx
        ├── RegisterPage.jsx
        ├── Auth.css
        ├── DashboardPage.jsx
        ├── Dashboard.css
        ├── SchedulesPage.jsx
        ├── BookPage.jsx
        ├── BookPage.css
        ├── ResourcesPage.jsx
        ├── AnalyticsPage.jsx
        └── Analytics.css
```

---

## Step 4 — Install Dependencies

```bash
npm install
```

Wait for it to finish. This downloads React, Vite, Axios, Recharts, etc.

---

## Step 5 — Start the Frontend

Make sure your backend is running first:
```bash
# In a separate terminal:
cd ~/Documents/scheduler-backend
npm run dev
```

Then start the frontend:
```bash
# In the frontend terminal:
npm run dev
```

You will see:
```
  VITE v5.x.x  ready in 300ms
  ➜  Local:   http://localhost:5173/
```

Open http://localhost:5173 in your browser.

---

## Pages and What They Do

| URL | Page | Who Can Access |
|-----|------|----------------|
| /login | Login | Everyone |
| /register | Register | Everyone |
| /dashboard | Dashboard with stats | All logged-in users |
| /schedules | View all schedules | All logged-in users |
| /book | Book a resource | All logged-in users |
| /analytics | Charts & analytics | All logged-in users |
| /resources | Manage resources | Admin only |

---

## How Frontend Connects to Backend

The `vite.config.js` file has a proxy:
```js
proxy: { '/api': { target: 'http://localhost:3000' } }
```

This means all API calls from the frontend to `/api/...`
are automatically forwarded to `http://localhost:3000/api/...`

JWT tokens are stored in `localStorage` and automatically
attached to every request via the Axios interceptor in `src/services/api.js`

---

## Common Errors and Fixes

| Error | Fix |
|-------|-----|
| `npm install` fails | Make sure you have Node.js installed |
| White screen on open | Check browser console for errors |
| Login fails with 401 | Make sure backend is running on port 3000 |
| CORS error | Vite proxy handles this — make sure vite.config.js is present |
| No schedules showing | Check that your backend DB has data |

---

## Build for Production

```bash
npm run build
```

This creates a `dist/` folder with optimised static files ready for deployment.

