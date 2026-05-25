#!/bin/bash
set -e

echo "🎮 Xbox Remote Control — Setup"
echo "==============================="

# Check node
if ! command -v node &> /dev/null; then
  echo "❌ Node.js is required. Install it first: https://nodejs.org"
  exit 1
fi

echo "✅ Node.js found: $(node --version)"

# Install deps
echo "📦 Installing dependencies..."
npm install 2>&1 | tail -3

# Patch the library's aggressive heartbeat timeout (8s → 20s)
EVENTS_FILE="node_modules/xbox-smartglass-core-node/src/events.js"
if [ -f "$EVENTS_FILE" ]; then
  if grep -q "seconds_ago > 8" "$EVENTS_FILE"; then
    sed -i 's/seconds_ago > 8/seconds_ago > 20/' "$EVENTS_FILE"
    sed -i 's/seconds_ago == 4/seconds_ago >= 4 \&\& seconds_ago % 3 === 0/' "$EVENTS_FILE"
    echo "✅ Patched heartbeat timeout (8s → 20s)"
  else
    echo "✅ Heartbeat already patched"
  fi
else
  echo "⚠️ Could not find events.js to patch"
fi

echo ""
echo "✅ Setup complete! Run with:"
echo "   npm start"
echo ""
echo "Then open http://localhost:3247 in your browser"
