#!/usr/bin/env bash
# Compile the project then run the interactive demo against the fixture data.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== Building mcp-server ==="
npm run build
echo ""

echo "=== Running demo ==="
node scripts/demo.js
