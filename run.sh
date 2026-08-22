#!/bin/bash
# RockyGPT Run Script

# Navigate to the script's directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "Error: npm is not installed. Please install Node.js."
    exit 1
fi

# Check if node_modules exists, install if missing
if [ ! -d "node_modules" ]; then
    echo "node_modules not found. Installing dependencies..."
    npm install
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "Warning: .env file not found."
    echo "Please make sure you create a .env file with BRAIN_URL, DATA_URL, and ADMIN_API_TOKEN."
fi

# Run the development server
echo "Starting Next.js development server..."
npm run dev
