# Zoom Webhook Setup Guide

This guide explains how to set up Zoom webhooks to automatically receive recording URLs when meetings are completed.

## Overview

The webhook system automatically:

- Receives notifications when Zoom meetings start, end, or recordings are completed
- Fetches recording URLs from Zoom API
- Updates the `ZoomSession` and `Booking` models with recording URLs
- Marks sessions as completed when recordings are available

## Prerequisites

1. A Zoom account with API access
2. A publicly accessible URL for your webhook endpoint (use ngrok or similar for local development)
3. Environment variables configured (see below)

## Environment Variables

Add the following to your `.env` file:

```env
ZOOM_WEBHOOK_SECRET_TOKEN=your_webhook_secret_token_here
```

**Note:** You'll get this token when setting up the webhook in Zoom App Marketplace.

## Setup Steps

### 1. Create a Webhook App in Zoom App Marketplace

1. Go to [Zoom App Marketplace](https://marketplace.zoom.us/)
2. Sign in with your Zoom account
3. Click "Develop" → "Build App"
4. Select "Webhook Only" as the app type
5. Fill in the app details:
   - App Name: Your app name
   - Company Name: Your company name
   - Developer Contact: Your email
6. Click "Create"

### 2. Configure Event Subscriptions

1. In your app's settings, go to the "Feature" tab
2. Enable "Event Subscription"
3. Add your webhook endpoint URL:

   ```
   https://your-domain.com/api/zoom/webhook
   ```

   **For local development:**

   ```
   https://your-ngrok-url.ngrok.io/api/zoom/webhook
   ```

4. Click "Add Event Subscription"
5. Subscribe to the following events:
   - `meeting.started` - When a meeting starts
   - `meeting.ended` - When a meeting ends
   - `recording.completed` - When all recordings are completed (most important)

### 3. Get Webhook Secret Token

1. In the Event Subscription settings, you'll see a "Secret Token"
2. Copy this token and add it to your `.env` file as `ZOOM_WEBHOOK_SECRET_TOKEN`
3. This token is used to verify webhook requests are from Zoom

### 4. Verify Webhook Setup

1. Zoom will send a verification request to your endpoint
2. The webhook controller automatically handles this verification
3. Check your server logs for: `✅ Webhook verification challenge received and responded`

### 5. Test the Webhook

1. Create a booking with a Zoom meeting (ensure `autoRecording: "cloud"` is enabled)
2. Start and end the meeting
3. Wait for the recording to process (may take a few minutes)
4. Check your server logs for webhook events:
   - `📥 Received Zoom webhook event: meeting.started`
   - `📥 Received Zoom webhook event: meeting.ended`
   - `📥 Received Zoom webhook event: recording.completed`
   - `✅ Found recording URL for meeting...`

## Webhook Endpoints

### POST `/api/zoom/webhook`

Handles all Zoom webhook events:

- `meeting.started` - Updates ZoomSession status to ONGOING
- `meeting.ended` - Updates ZoomSession end time
- `recording.completed` - Fetches recording URLs and updates ZoomSession and Booking

### GET `/api/zoom/webhook`

Handles webhook verification challenge from Zoom (used during initial setup)

## How It Works

1. **Meeting Created**: When a booking is created, a Zoom meeting is created with `autoRecording: "cloud"`

2. **Meeting Starts**: Zoom sends `meeting.started` webhook → Updates ZoomSession status to `ONGOING`

3. **Meeting Ends**: Zoom sends `meeting.ended` webhook → Updates ZoomSession end time

4. **Recording Completed**:
   - Zoom sends `recording.completed` webhook
   - System fetches recording details from Zoom API
   - Updates ZoomSession with `recordingUrl`
   - Updates ZoomSession status to `COMPLETED`
   - The ZoomSession post-save hook automatically updates the Booking with `zoomRecordingLink`

## Data Flow

```
Zoom Meeting → Webhook Event → Webhook Controller
                                      ↓
                            Find ZoomSession by meetingId
                                      ↓
                            Fetch Recording URLs from Zoom API
                                      ↓
                            Update ZoomSession (recordingUrl, status)
                                      ↓
                            Post-save Hook Updates Booking (zoomRecordingLink)
```

## Troubleshooting

### Webhook Not Receiving Events

1. **Check URL Accessibility**: Ensure your webhook URL is publicly accessible

   - Use `ngrok` for local development: `ngrok http 5010`
   - Update the URL in Zoom App Marketplace

2. **Check Webhook Secret**: Verify `ZOOM_WEBHOOK_SECRET_TOKEN` is set correctly

3. **Check Server Logs**: Look for webhook events in your server console

4. **Verify Event Subscriptions**: Ensure events are subscribed in Zoom App Marketplace

### Recording URLs Not Appearing

1. **Check Auto-Recording**: Ensure meetings are created with `autoRecording: "cloud"`

2. **Wait for Processing**: Recordings may take a few minutes to process after meeting ends

3. **Check Zoom Account**: Ensure your Zoom account has cloud recording enabled

4. **Check API Permissions**: Ensure your Zoom app has recording read permissions

### Webhook Verification Failing

1. Ensure `ZOOM_WEBHOOK_SECRET_TOKEN` matches the token in Zoom App Marketplace
2. Check that the webhook endpoint is accessible
3. Review server logs for verification errors

## Security Notes

- Webhook signature verification is implemented to ensure requests are from Zoom
- If `ZOOM_WEBHOOK_SECRET_TOKEN` is not set, verification is disabled (development only)
- Always use HTTPS in production
- Keep your webhook secret token secure and never commit it to version control

## Local Development

For local development, use a tunneling service to expose your local server to the internet.

### Option 1: Using ngrok (Recommended)

#### Step 1: Install ngrok

```bash
# macOS (using Homebrew)
brew install ngrok/ngrok/ngrok

# Or download from https://ngrok.com/download
# Or use npm
npm install -g ngrok
```

#### Step 2: Start your development server

In one terminal:

```bash
npm run dev
```

#### Step 3: Start ngrok tunnel

In another terminal:

```bash
# Using the provided script
./start-dev-tunnel.sh ngrok

# Or directly
ngrok http 5010
```

#### Step 4: Copy your ngrok URL

ngrok will display a URL like:

```
Forwarding  https://abc123.ngrok-free.app -> http://localhost:5010
```

Copy the HTTPS URL (e.g., `https://abc123.ngrok-free.app`) and use it in Zoom App Marketplace:

```
https://abc123.ngrok-free.app/api/zoom/webhook
```

**Note:** If you're using the free ngrok plan, the URL changes every time you restart ngrok. For testing, you can use ngrok's static domain feature (requires paid plan) or update the webhook URL in Zoom each time.

### Option 2: Using localtunnel

```bash
npm run dev:lt
```

### Option 3: Run both dev server and ngrok together

You can run both in separate terminals, or use a process manager like `concurrently`:

```bash
# Install concurrently (if not already installed)
npm install --save-dev concurrently

# Then add this script to package.json:
# "dev:with-tunnel": "concurrently \"npm run dev\" \"ngrok http 5010\""
```

### Testing the Webhook Locally

1. Start your dev server: `npm run dev`
2. Start ngrok: `./start-dev-tunnel.sh ngrok` (or `ngrok http 5010`)
3. Copy the ngrok HTTPS URL
4. Update the webhook URL in Zoom App Marketplace to: `https://YOUR-NGROK-URL/api/zoom/webhook`
5. Test by creating a booking and completing a meeting
6. Check your server logs for webhook events

## Production Deployment

1. Deploy your application to a server with a public URL
2. Update the webhook URL in Zoom App Marketplace to your production URL
3. Ensure `ZOOM_WEBHOOK_SECRET_TOKEN` is set in your production environment
4. Test the webhook with a real meeting

## Additional Resources

- [Zoom Webhook Documentation](https://marketplace.zoom.us/docs/api-reference/webhook-reference)
- [Zoom Recording API](https://marketplace.zoom.us/docs/api-reference/zoom-api/cloud-recording/recordingget)
- [Zoom Event Types](https://marketplace.zoom.us/docs/api-reference/webhook-reference/event-types)
