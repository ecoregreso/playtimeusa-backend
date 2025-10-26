# Render Deployment Checklist

This document provides a step-by-step guide to deploy the PlaytimeUSA backend on Render.

## Prerequisites

- A Render account ([render.com](https://render.com))
- Access to this GitHub repository

## Deployment Steps

### 1. Connect Repository to Render

1. Log in to your Render dashboard
2. Click "New +" and select "Blueprint"
3. Connect your GitHub account if not already connected
4. Select the `ecoregreso/playtimeusa-backend` repository
5. Render will automatically detect the `render.yaml` file

### 2. Configure Service

The `render.yaml` file contains most configuration, but you'll need to:

1. **Review the service name**: `playtimeusa-backend`
2. **Review the region**: `oregon` (change if needed)
3. **Review the plan**: `starter` (can be changed to `free` or other plans)

### 3. Set Required Environment Variables

In the Render dashboard, navigate to your service settings and add these **secret** environment variables:

#### Required Secrets

| Variable | Description | Example |
|----------|-------------|---------|
| `JWT_SECRET` | Secret key for JWT token signing | Use a 64+ character random string |
| `ADMIN_KEY` | Admin API authentication key | Use a 32+ character random string |

**To generate secure random strings:**

```bash
# For JWT_SECRET (64 characters)
openssl rand -base64 64 | tr -d '\n'

# For ADMIN_KEY (32 characters)
openssl rand -base64 32 | tr -d '\n'
```

#### Pre-configured Variables

These are already set in `render.yaml` but can be customized if needed:

| Variable | Default Value | Description |
|----------|---------------|-------------|
| `FRONTEND_ORIGIN` | `https://playtimeusa.net,https://games.playtimeusa.net` | Comma-separated allowed CORS origins |

### 4. Deploy

1. Click "Apply" or "Deploy" in the Render dashboard
2. Render will:
   - Run `npm install` to install dependencies
   - Start the server with `npm start`
   - Monitor the `/health` endpoint

### 5. Verify Deployment

After deployment completes:

1. **Check the health endpoint:**
   ```bash
   curl https://playtimeusa-backend.onrender.com/health
   ```
   Should return: `{"ok":true}`

2. **Test admin endpoint (requires your ADMIN_KEY):**
   ```bash
   curl -X POST https://playtimeusa-backend.onrender.com/api/cashier/voucher \
     -H "Content-Type: application/json" \
     -H "X-Admin-Key: YOUR_ADMIN_KEY_HERE" \
     -d '{"amount": 100}'
   ```
   Should return a voucher with a code.

## Troubleshooting

### Deployment Fails at Build

- Check that all dependencies are installed correctly
- Review the build logs in Render dashboard
- Ensure Node.js version matches (20.x specified in package.json)

### Health Check Fails

- Verify the server is listening on the correct PORT (provided by Render)
- Check application logs for startup errors
- Ensure database migrations complete successfully

### CORS Errors from Frontend

- Verify `FRONTEND_ORIGIN` includes your frontend domain(s)
- Use comma-separated values for multiple origins
- Ensure no trailing slashes in the origins

### Authentication Errors

- Double-check that `JWT_SECRET` and `ADMIN_KEY` are set correctly
- Ensure no extra whitespace in the secret values
- Re-deploy after setting environment variables

## Database

The application uses SQLite and automatically:
- Creates the database file on first startup
- Runs migrations to create tables
- Persists data on Render's disk (note: free tier may lose data on restart)

**For production**, consider:
- Upgrading to a paid Render plan with persistent disk
- OR migrating to a managed database (PostgreSQL, MongoDB)

## Monitoring

- **Health Check**: Render automatically monitors `/health`
- **Logs**: Available in Render dashboard under "Logs" tab
- **Metrics**: Available in Render dashboard for paid plans

## Updating the Application

To deploy updates:

1. Push changes to the `main` branch on GitHub
2. Render will automatically detect and deploy (if `autoDeploy: true`)
3. OR manually trigger a deploy from the Render dashboard

## Security Considerations

✅ **JWT_SECRET** and **ADMIN_KEY** are marked as secrets in render.yaml
✅ CORS is configured to specific domains (not wildcard)
✅ SQLite database is not committed to git
✅ All dependencies are up to date

⚠️ **Important**: Keep your `JWT_SECRET` and `ADMIN_KEY` secure and never commit them to git!

## Support

For issues with:
- **Render platform**: Contact Render support
- **Application code**: Check the GitHub repository issues
- **Environment configuration**: Review this document and render.yaml
