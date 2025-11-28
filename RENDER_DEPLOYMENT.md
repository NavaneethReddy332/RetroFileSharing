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

### 2. Database Configuration (REQUIRED)
```
DATABASE_URL=your_postgresql_connection_string
```

### 3. Session Secret (REQUIRED for security)
```
SESSION_SECRET=your_random_secret_key_here
```

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

After setting the `DATABASE_URL`:

1. The database schema will be automatically pushed on first deployment
2. Or you can manually run: `npm run db:push` in the Render shell

## Troubleshooting 502 Errors

The 502 errors you're experiencing are caused by:

1. **Missing Backblaze credentials** - The upload endpoint fails when it can't connect to B2
2. **Missing database connection** - The app can't store file metadata
3. **Missing session secret** - Session management fails

After adding all environment variables, the 502 errors should be resolved.

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
