#!/bin/bash

# Get current directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "🎨 Starting Painting by Numbers Studio..."

# Check if node_modules exists, install if not
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Kill any existing node/vite processes on ports to clean up
lsof -ti:3000,3001 | xargs kill -9 2>/dev/null

# Start Backend
echo "Starting Backend Database..."
node server/index.js &
BACKEND_PID=$!

# Wait for backend to init
sleep 2

# Start Frontend
echo "Starting Frontend..."
npm run dev -- --host &
FRONTEND_PID=$!

# Open Browser
sleep 3
open "http://localhost:3000"

# Cleanup on exit
trap "kill $BACKEND_PID $FRONTEND_PID; exit" SIGINT SIGTERM

# Keep script running
wait
