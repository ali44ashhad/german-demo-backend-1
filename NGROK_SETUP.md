# Ngrok Setup Guide for Webhook Testing

This guide helps you set up ngrok to test Zoom webhooks locally.

## Quick Start

1. **Install ngrok** (if not already installed):

   ```bash
   # macOS
   brew install ngrok/ngrok/ngrok

   # Or download from https://ngrok.com/download
   # Or via npm
   npm install -g ngrok
   ```

2. **Start your development server** (in one terminal):

   ```bash
   npm run dev
   ```

3. **Start ngrok tunnel** (in another terminal):

   ```bash
   ./start-dev-tunnel.sh ngrok
   ```

   Or directly:

   ```bash
   ngrok http 5010
   ```

4. **Copy your ngrok URL**:
   ngrok will display something like:

   ```
   Forwarding  https://abc123.ngrok-free.app -> http://localhost:5010
   ```

   Your webhook URL will be:

   ```
   https://abc123.ngrok-free.app/api/zoom/webhook
   ```

5. **Update Zoom App Marketplace**:
   - Go to your Zoom App → Event Subscriptions
   - Update the webhook URL to your ngrok URL
   - Save and verify

## Important Notes

### Free ngrok Plan

- URLs change every time you restart ngrok
- You'll need to update the webhook URL in Zoom each time
- Consider using ngrok's static domain (paid feature) for easier testing

### ngrok Authentication (Recommended)

1. Sign up at https://dashboard.ngrok.com
2. Get your authtoken from the dashboard
3. Configure ngrok:
   ```bash
   ngrok config add-authtoken YOUR_AUTH_TOKEN
   ```
4. This gives you longer session times and more features

### Testing Checklist

- [ ] Dev server is running on port 5010
- [ ] ngrok tunnel is active and forwarding to localhost:5010
- [ ] Webhook URL is updated in Zoom App Marketplace
- [ ] `ZOOM_WEBHOOK_SECRET_TOKEN` is set in `.env`
- [ ] Test webhook verification (Zoom will send a test request)
- [ ] Create a test booking with a Zoom meeting
- [ ] Start and end the meeting
- [ ] Check server logs for webhook events

## Troubleshooting

### ngrok not found

```bash
# Install via Homebrew (macOS)
brew install ngrok/ngrok/ngrok

# Or download from https://ngrok.com/download
```

### Port already in use

If port 5010 is already in use, either:

- Change the PORT in your `.env` file
- Or specify a different port: `ngrok http 3000`

### Webhook not receiving events

1. Verify ngrok is running and forwarding correctly
2. Check the webhook URL in Zoom matches your ngrok URL exactly
3. Ensure your dev server is running
4. Check server logs for incoming requests
5. Verify webhook secret token is correct

### ngrok session expired

Free ngrok sessions expire after 2 hours. Simply restart ngrok:

```bash
./start-dev-tunnel.sh ngrok
```

Then update the webhook URL in Zoom with the new ngrok URL.

## Alternative: Using ngrok with Static Domain

If you have a paid ngrok account, you can use a static domain:

```bash
ngrok http 5010 --domain=your-static-domain.ngrok-free.app
```

This way, your webhook URL stays the same even after restarting ngrok.
