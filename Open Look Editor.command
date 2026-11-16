#!/bin/zsh
# Double-click this file to open the look editor in Chrome.
# Keep this window open while you edit. Close it (or press Ctrl+C) to stop the editor.
cd "$(dirname "$0")"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
if lsof -iTCP:4747 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "The look editor is already running. Opening it in Chrome..."
  open -a "Google Chrome" http://127.0.0.1:4747/ || open http://127.0.0.1:4747/
  sleep 2
  exit 0
fi
echo "Starting the look editor..."
node tools/editor/server.mjs
