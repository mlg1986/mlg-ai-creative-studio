#!/bin/bash

# Paint Engine – Start Script
# Double-click this file to start both backend and frontend

cd "$(dirname "$0")"

echo ""
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║   🎨 MLG AI CREATIVE STUDIO                 ║"
echo "  ║   Intelligent Product Photography            ║"
echo "  ╚══════════════════════════════════════════════╝"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo "   Please install Node.js from https://nodejs.org/"
    echo ""
    read -p "Press Enter to close..."
    exit 1
fi

echo "✅ Node.js $(node -v)"

# Install dependencies if needed
if [ ! -d "backend/node_modules" ]; then
    echo "📦 Installing backend dependencies..."
    cd backend && npm install && cd ..
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    cd frontend && npm install && cd ..
fi

# Create directories
mkdir -p public/uploads public/renders logs

# Check .env
if [ ! -f ".env" ]; then
    echo "⚠️  No .env file found. Creating template..."
    cat > .env << 'EOF'
GEMINI_API_KEY=your-api-key-here
PORT=3001
NODE_ENV=development
LOG_LEVEL=debug
EOF
    echo "   Please edit .env and add your GEMINI_API_KEY"
fi

echo ""
echo "🚀 Starting MLG AI Creative Studio..."
echo "   Backend:  http://localhost:3001"
echo "   Frontend: http://localhost:5173"
echo ""

# Kill existing processes on these ports
lsof -ti:3001 2>/dev/null | xargs kill -9 2>/dev/null
lsof -ti:5173 2>/dev/null | xargs kill -9 2>/dev/null

# Start backend
cd backend
npm run dev &
BACKEND_PID=$!
cd ..

# Wait for backend to start
sleep 2

# Start frontend
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

# Wait a moment then open browser
sleep 3
open "http://localhost:5173"

echo ""
echo "✅ MLG AI Creative Studio is running!"
echo "   Press Ctrl+C to stop both servers"
echo ""

# Wait for both processes
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
