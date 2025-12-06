# Render Deployment Guide for RetroSend

## Critical: Environment Variables Required

Your application needs these environment variables configured on Render to work properly:

### 1. Backblaze B2 Credentials (REQUIRED for file uploads)
```
B2_APPLICATION_KEY_ID=your_application_key_id
B2_APPLICATION_KEY=your_application_key
B2_BUCKET_ID=your_bucket_id
B2_BUCKET_NAME=your_bucket_name
```

**This is why you're getting 502 errors!** Without these variables, file uploads fail.

### 2. Database Configuration (REQUIRED - Turso)
```
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your_turso_auth_token
```

### 3. Session Secret (REQUIRED for security and authentication)
```
SESSION_SECRET=your_random_secret_key_here
```

**IMPORTANT:** Generate a strong random secret (at least 32 characters). You can generate one using:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Without SESSION_SECRET properly configured, users will experience:
- 401 Unauthorized errors on `/api/user/files`
- Auto-login failures
- Session not persisting between requests

### 4. Node Environment
```
NODE_ENV=production
```

## How to Set Environment Variables on Render

1. Go to your Render Dashboard
2. Select your web service
3. Click on "Environment" in the left sidebar
4. Click "Add Environment Variable"
5. Add each variable listed above with their values
6. Click "Save Changes"
7. Render will automatically redeploy your application

## Build & Start Commands

Your deployment is already configured with:
- **Build Command**: `npm run build`
- **Start Command**: `npm run start`

These are set in the `deploy_config_tool` and should work automatically.

## Database Setup

After setting the Turso credentials:

1. Create a Turso database at https://turso.tech
2. Get your database URL and auth token from the Turso dashboard
3. Add them as environment variables on Render
4. The schema will be synced automatically

## Troubleshooting 401 Unauthorized Errors

If you're getting 401 errors on `/api/user/files` or `/api/auth/me`:

1. **Ensure SESSION_SECRET is set** - This is the most common cause
2. **Ensure NODE_ENV=production is set** - Required for proper cookie handling
3. **Redeploy after code updates** - The session configuration has been updated to:
   - Trust Render's reverse proxy (`trust proxy`)
   - Use proper cookie SameSite settings (`sameSite: 'none'`)
   - Use secure cookies in production

After deploying the latest code and setting environment variables, authentication should work properly.

## Troubleshooting 502 Errors

The 502 errors you're experiencing are caused by:

1. **Missing Backblaze credentials** - The upload endpoint fails when it can't connect to B2
2. **Missing Turso database connection** - The app can't store file metadata
3. **Missing session secret** - Session management fails

After adding all environment variables, the 502 errors should be resolved.

## Troubleshooting 500 "Failed to read uploaded file" Error

If you see this error on Render but uploads work on Replit:

1. This is typically caused by temp file issues on Render's ephemeral filesystem
2. The app now uses `/tmp/retrosend-uploads` directory explicitly
3. Redeploy your app after getting the latest code
4. Check Render logs for detailed error messages

## Port Configuration

The application is configured to run on port 5000 (as seen in `server/index-dev.ts` and `server/index-prod.ts`). Render will automatically handle port mapping.

## Getting Your Backblaze B2 Credentials

If you don't have Backblaze B2 set up:

1. Go to https://www.backblaze.com/b2/cloud-storage.html
2. Create an account (they have a free tier)
3. Create a bucket
4. Generate an application key
5. Copy the credentials to Render's environment variables

## Verification

After setting all environment variables:

1. Wait for Render to redeploy (usually 2-3 minutes)
2. Visit your deployed URL
3. Try uploading a file
4. The 502 error should be gone!
