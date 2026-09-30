# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# iTelemetry v3 — ChatOps microservice image
#
# This is an INDEPENDENT service that runs only the chatops domain. It bundles
# the shared/ connector package plus domains/chatops/.
#
# NOTE: build with the backend/ folder as the context (so shared/ is available):
#   docker build -t itelemetry/chatops:local -f backend/domains/chatops/Dockerfile backend
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app

# System dependencies: Microsoft ODBC Driver 18 (for pyodbc) + build tools.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl gnupg unixodbc-dev gcc g++ \
    && curl -sSL https://packages.microsoft.com/keys/microsoft.asc \
        | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg \
    && curl -sSL https://packages.microsoft.com/config/debian/12/prod.list \
        | sed 's|https://|[signed-by=/usr/share/keyrings/microsoft-prod.gpg] https://|' \
        > /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y --no-install-recommends msodbcsql18 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Reuse the backend requirements (context = backend/). pywin32 is Windows-only.
COPY requirements.txt ./
RUN grep -viE '^(pywin32|pywin32-ctypes)\b' requirements.txt > requirements.linux.txt \
    && pip install --no-cache-dir -r requirements.linux.txt gunicorn==23.0.0

# Bundle only what this microservice needs: the shared layer, the chatops
# domain, and the chatops VSA route slice (apis/chatops.py).
COPY shared/ ./shared/
COPY domains/chatops/ ./domains/chatops/
COPY apis/chatops.py ./apis/chatops.py

RUN useradd --create-home --uid 10001 appuser
USER appuser

EXPOSE 5001

CMD ["gunicorn", "--bind", "0.0.0.0:5001", "--workers", "2", "--timeout", "120", "domains.chatops.service:app"]
