#!/usr/bin/env bash
# Canonical Zip Archive Creation Script for VeriShield AI Submission
set -euo pipefail

echo "🔒 Step 1: Running pre-zip secret leak verification..."
npm run check:secrets

echo ""
echo "📦 Step 2: Packaging clean project into submission zip archive..."
ZIP_NAME="VeriShield_Officer_v2_full.zip"

tar -a -cf "$ZIP_NAME" \
  --exclude="node_modules" \
  --exclude=".venv" \
  --exclude=".venv312" \
  --exclude=".output" \
  --exclude=".wrangler" \
  --exclude="playwright-report" \
  --exclude="test-results" \
  --exclude=".tanstack" \
  --exclude="scratch" \
  --exclude="*.log" \
  --exclude="*.zip" \
  --exclude=".env" \
  --exclude=".env.local" \
  --exclude="backend/.env" \
  --exclude="backend/.env.local" \
  --exclude="backend/verishield.db" \
  --exclude="backend/verishield.db-shm" \
  --exclude="backend/verishield.db-wal" \
  --exclude="backend/pytest_final_output.txt" \
  --exclude="frontend_test_output.txt" .

echo ""
echo "📋 Step 3: Verifying file manifest of $ZIP_NAME..."
ZIP_CONTENTS=$(tar -tf "$ZIP_NAME")
echo "$ZIP_CONTENTS"

echo ""
echo "🔍 Step 4: Sanity checking zip file manifest for forbidden .env secret files..."
ENV_MATCHES=$(echo "$ZIP_CONTENTS" | grep -E '(^|/)\.env(\.[^/]+)?$' | grep -v '\.example$' || true)

if [ -n "$ENV_MATCHES" ]; then
  echo "❌ CRITICAL: Found forbidden secret .env file(s) in zip archive:" >&2
  echo "$ENV_MATCHES" >&2
  exit 1
else
  echo "No forbidden .env files found in archive manifest (Grep search returned empty)."
fi

echo ""
echo "✅ [SUCCESS] Submission zip created successfully and verified clean!"
