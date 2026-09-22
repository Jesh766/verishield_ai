# VeriShield AI — Production-Oriented Container Image
#
# Security principles:
#   - Non-root user (verishield, UID 1000)
#   - Minimal runtime: no dev tools, no test fixtures, no build artifacts
#   - No secrets baked into the image — all config via environment variables
#   - Single exposed port (8000)
#   - Health endpoint available at /health/live
#
# Build:
#   docker build -t verishield-backend:3.1.0 .
#
# Run (development):
#   docker run -e ADMIN_PASSCODE=<secret> -p 8000:8000 verishield-backend:3.1.0
#
# Run (production):
#   All secrets must be injected via a managed secret store — never via docker run args
#   or environment variables baked into images.

FROM python:3.12-slim AS base

# Security: run as non-root
RUN groupadd --gid 1000 verishield && \
    useradd --uid 1000 --gid verishield --shell /bin/sh --create-home verishield

WORKDIR /app

# Install only runtime system dependencies
# Tesseract is kept out of the container because OCR runs client-side (browser WASM).
# Only the Python API backend runs in this container.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# ---- Dependency installation stage ----
FROM base AS deps

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ---- Runtime stage ----
FROM base AS runtime

# Copy installed packages from deps stage
COPY --from=deps /usr/local/lib/python3.12 /usr/local/lib/python3.12
COPY --from=deps /usr/local/bin /usr/local/bin

# Copy application source only — no test fixtures, no .env, no private keys
COPY backend/app/ /app/app/

# Runtime-writable database directory (non-root owner)
RUN mkdir -p /data && chown verishield:verishield /data

# Switch to non-root user
USER verishield

# Environment defaults — override all of these in deployment
ENV VERISHIELD_DB=/data/verishield.db
ENV VERISHIELD_UPLOADS=/data/uploads
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Single exposed port
EXPOSE 8000

# Health check — uses liveness endpoint (no DB dependency)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health/live', timeout=4)"

# Predictable startup command
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
