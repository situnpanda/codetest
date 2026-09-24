FROM artifactory.wu2.cloud.providence.org/docker-remote/python:3.12-slim

# Set working directory
WORKDIR /app

# Environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    FLASK_APP=main.py \
    FLASK_ENV=production \
    FLASK_RUN_HOST=0.0.0.0 \
    FLASK_RUN_PORT=5000 \
    CHROME_BIN=/usr/bin/chromium \
    CHROMEDRIVER_BIN=/usr/bin/chromedriver

# Install system dependencies, Microsoft ODBC driver, runtime libraries, and register driver
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl gnupg apt-transport-https ca-certificates \
        unixodbc unixodbc-dev gcc g++ \
    && curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/microsoft-prod.gpg] https://packages.microsoft.com/debian/12/prod bookworm main" > /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y --no-install-recommends msodbcsql17 \
    && apt-get install -y --no-install-recommends libstdc++6 libssl3 libgssapi-krb5-2 \
    && ln -s /opt/microsoft/msodbcsql17/lib64/libmsodbcsql-17.*.so.* /usr/lib/libmsodbcsql.so \
    && printf "[ODBC Driver 17 for SQL Server]\nDriver=/usr/lib/libmsodbcsql.so\nUsageCount=1\n" > /etc/odbcinst.ini \
    && apt-get purge -y gnupg gcc g++ \
    && apt-get autoremove -y \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /usr/share/keyrings/microsoft-prod.gpg /etc/apt/sources.list.d/mssql-release.list

# Install Chromium and ChromeDriver for Selenium (used by InterfaceMetrics one-click validation)
RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium chromium-driver \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies.
# pywin32 is Windows-only, so strip it before installing on this Linux image.
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && grep -viE '^(pywin32|pywin32-ctypes)([=<>!~ ].*)?$' requirements.txt > requirements.linux.txt \
    && pip install --no-cache-dir -r requirements.linux.txt \
    && pip install --no-cache-dir gunicorn

# Copy application code
COPY . .

# Create non-root user
RUN useradd -m -u 1000 flaskuser && chown -R flaskuser:flaskuser /app \
    && mkdir -p /tmp/chrome-data && chmod 777 /tmp/chrome-data
USER flaskuser

EXPOSE 5000

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "1", "--threads", "4", "--worker-class", "gthread", "--timeout", "120", "--keep-alive", "5", "--max-requests", "500", "--max-requests-jitter", "100", "main:app"]
