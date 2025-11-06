#!/bin/bash

# Script to start ngrok tunnel for webhook testing
# Usage: ./start-dev-tunnel.sh ngrok

PORT=${PORT:-5010}
TUNNEL_TYPE=${1:-ngrok}

if [ "$TUNNEL_TYPE" = "ngrok" ]; then
  echo "🚀 Starting ngrok tunnel on port $PORT..."
  echo "📋 Your webhook URL will be: https://YOUR-NGROK-URL.ngrok.io/api/zoom/webhook"
  echo ""
  ngrok http $PORT
elif [ "$TUNNEL_TYPE" = "localtunnel" ]; then
  echo "🚀 Starting localtunnel on port $PORT..."
  npx localtunnel --port $PORT
else
  echo "❌ Unknown tunnel type: $TUNNEL_TYPE"
  echo "Usage: ./start-dev-tunnel.sh [ngrok|localtunnel]"
  exit 1
fi

