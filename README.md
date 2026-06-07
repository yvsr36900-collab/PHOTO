# SnapGather

A centralized event photo-sharing platform. Create a session, share a 6-character code or QR code, guests join and upload photos — no app install required.

## Project Structure

```
/
├── client/          React 18 + Vite + Tailwind frontend
├── server/          Node.js + Express + SQLite backend
├── .env.example     Environment variable template
└── README.md
```

## Prerequisites

- Node.js 18+
- npm 8+

## Quick Start

### 1. Install dependencies

```bash
# Server
cd server && npm install

# Client
cd client && npm install
```

### 2. Configure environment

```bash
cp .env.example server/.env
# Edit server/.env with your values
```

Minimum required for local dev — only `JWT_SECRET` and `PORT` are needed to run. Google Drive is optional.

### 3. Start dev servers (two terminals)

**Terminal 1 — Backend:**
```bash
cd server
npm run dev
# Runs on http://localhost:3001
```

**Terminal 2 — Frontend:**
```bash
cd client
npm run dev
# Runs on http://localhost:5173
```

Open [http://localhost:5173](http://localhost:5173).

## Demo Accounts

On first run the database seeds three accounts (password: `password123`):

| Email | Plan |
|---|---|
| free@demo.com | Free |
| standard@demo.com | Standard |
| premium@demo.com | Premium |

## Environment Variables

| Variable | Description |
|---|---|
| `PORT` | Server port (default: 3001) |
| `JWT_SECRET` | Secret key for signing JWTs — use a long random string in production |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID (for Drive export, Premium only) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 Client Secret |
| `GOOGLE_REDIRECT_URI` | Must match the URI registered in Google Cloud Console (`http://localhost:3001/auth/google/callback` for local dev) |

## Configuring Google Drive OAuth (Premium Export)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project and enable the **Google Drive API v3**
3. Go to **Credentials → Create OAuth 2.0 Client ID** (Web application)
4. Add `http://localhost:3001/auth/google/callback` as an authorized redirect URI
5. Copy the Client ID and Secret into `server/.env`
6. Log in as a Premium user, open a session, go to **Share**, and click **Connect Google Drive** — authorize once, then use the **☁ Drive** export button in any session

## Plan Limits

| Feature | Free | Standard | Premium |
|---|---|---|---|
| Photos per session | 10 | 200 | Unlimited |
| Active sessions | 1 | 5 | Unlimited |
| QR code join | ✗ | ✓ | ✓ |
| RSVP link | ✗ | ✗ | ✓ |
| Invite poster | ✗ | ✗ | ✓ |
| Google Drive export | ✗ | ✗ | ✓ |
| ZIP download | ✓ | ✓ | ✓ |

## API Overview

All responses follow `{ success: true, data: ... }` or `{ success: false, error: "..." }`.

| Route | Auth | Description |
|---|---|---|
| POST /api/auth/register | — | Create account |
| POST /api/auth/login | — | Login |
| GET /api/auth/me | JWT | Current user |
| POST /api/sessions | JWT | Create session |
| GET /api/sessions | JWT | List my sessions |
| GET /api/sessions/code/:code | — | Lookup by join code |
| POST /api/sessions/join | optional | Join as guest or user |
| POST /api/sessions/:id/add-time | JWT (host) | Extend session |
| GET /api/sessions/:id/qr | JWT (standard+) | QR code data URL |
| POST /api/photos/session/:id | optional | Upload photo |
| GET /api/photos/session/:id | — | List photos |
| DELETE /api/photos/:id | optional | Delete photo |
| GET /api/export/zip/:sessionId | — | Download ZIP |
| POST /api/export/drive/:sessionId | JWT (premium) | Export to Drive |
| POST /api/rsvp/:joinCode | — | Submit RSVP |
| GET /api/rsvp/:sessionId | JWT (premium host) | Get RSVP list |
| GET /auth/google/connect | JWT | Get Drive auth URL |
| GET /auth/google/callback | — | OAuth callback |
