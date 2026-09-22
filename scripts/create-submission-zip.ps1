# Canonical Zip Archive Creation Script for VeriShield AI Submission
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "Step 1: Running pre-zip secret leak verification..."
npm run check:secrets
if ($LASTEXITCODE -ne 0) {
    Write-Error "CRITICAL: Pre-zip secret check failed! Aborting zip archive creation."
    exit 1
}

Write-Host "Step 2: Packaging clean project into submission zip archive..."
$zipName = "VeriShield_Officer_v2_full.zip"

tar -a -cf $zipName `
  --exclude="node_modules" `
  --exclude=".venv" `
  --exclude=".venv312" `
  --exclude=".output" `
  --exclude=".wrangler" `
  --exclude="playwright-report" `
  --exclude="test-results" `
  --exclude=".tanstack" `
  --exclude="scratch" `
  --exclude="*.log" `
  --exclude="*.zip" `
  --exclude=".env" `
  --exclude=".env.local" `
  --exclude="backend/.env" `
  --exclude="backend/.env.local" `
  --exclude="backend/verishield.db" `
  --exclude="backend/verishield.db-shm" `
  --exclude="backend/verishield.db-wal" `
  --exclude="backend/pytest_final_output.txt" `
  --exclude="frontend_test_output.txt" .

if ($LASTEXITCODE -ne 0) {
    Write-Error "CRITICAL: Tar compression failed!"
    exit 1
}

Write-Host "Step 3: Verifying file manifest of $zipName..."
$zipContents = tar -tf $zipName
$zipContents

Write-Host "Step 4: Sanity checking zip file manifest for forbidden .env secret files..."
$envMatches = $zipContents | Where-Object { $_ -match "\.env" -and $_ -notmatch "\.example" }

if ($envMatches) {
    Write-Host "CRITICAL: Found forbidden secret .env file(s) in zip archive:"
    $envMatches | ForEach-Object { Write-Host "  - " $_ }
    Write-Error "Zip verification failed due to secret .env file inclusion!"
    exit 1
} else {
    Write-Host "No forbidden .env files found in archive manifest (Grep search returned empty)."
}

Write-Host "SUCCESS: Submission zip created successfully and verified clean!"
