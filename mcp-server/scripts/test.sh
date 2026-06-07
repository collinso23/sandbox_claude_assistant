#!/usr/bin/env bash
# Run the full Jest suite with verbose output and inline coverage.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== sbox-claude mcp-server tests ==="
echo ""

npx jest --verbose --coverage 2>&1
