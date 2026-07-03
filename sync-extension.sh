#!/usr/bin/env bash
# Copy the shared app files into the extension/ folder so the Chrome extension
# never drifts from the web app. Run after editing index.html / app.js / attendance.js / lib.
set -e
cd "$(dirname "$0")"
cp index.html app.js attendance.js extension/
rm -rf extension/lib && cp -r lib extension/lib
echo "extension/ synced with web app files."
