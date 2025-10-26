# PlaytimeUSA Backend

A Node.js backend for PlaytimeUSA casino platform, using SQLite for data storage and Express for the API.

## Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run the server:**
   ```bash
   npm start
   ```
   
   For development with auto-reload:
   ```bash
   npm run dev
   ```

3. **Environment variables (optional for local development):**
   - `PORT` - Server port (default: 3000)
   - `DB_FILE` - SQLite database file path (default: ./database.sqlite)
   - `FRONTEND_ORIGIN` - Comma-separated list of allowed CORS origins (default: '*')
   - `JWT_SECRET` - Secret for JWT tokens (default: 'dev-secret')
   - `ADMIN_KEY` - Admin authentication key (default: 'dev-admin-key')

## Deploy on Render

This repository is configured for automatic deployment on Render using the included `render.yaml` file.

### One-Click Deploy

The `render.yaml` file contains all necessary configuration. Render will automatically:
- Install dependencies with `npm install`
- Start the server with `npm start`
- Monitor the `/health` endpoint

### Required Environment Variables

After deploying, set these secrets in the Render dashboard:

- **JWT_SECRET** - A secure random string for JWT token signing
- **ADMIN_KEY** - A secure random string for admin authentication

These are marked with `sync: false` in render.yaml to prevent accidental overwrites.

### Optional Environment Variables

These are pre-configured in render.yaml but can be customized:

- **FRONTEND_ORIGIN** - Comma-separated list of allowed frontend origins (default: "https://playtimeusa.net,https://games.playtimeusa.net")

## API Endpoints

### Public Endpoints
- `GET /health` - Health check endpoint

### Player Endpoints
- `GET /api/balance` - Get player balance (requires auth)
- `POST /api/voucher/redeem` - Redeem a voucher code (requires auth)
- `POST /api/spin` - Play a slot spin (requires auth)

### Admin Endpoints
- `POST /api/cashier/voucher` - Create a new voucher (requires X-Admin-Key header)

## Authentication

- **Player auth**: Use `Authorization: Bearer <token>` header or `X-User-Id` header for development
- **Admin auth**: Use `X-Admin-Key: <your-admin-key>` header

## Database

The application uses SQLite with automatic migrations on startup. The database file is created automatically if it doesn't exist.
