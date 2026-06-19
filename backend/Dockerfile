FROM python:3.12-slim

# ping is required for real monitoring mode
RUN apt-get update && apt-get install -y --no-install-recommends iputils-ping \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Data volume for the SQLite database
VOLUME ["/data"]
ENV DATABASE_URL=sqlite+aiosqlite:////data/station_monitor.db

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
