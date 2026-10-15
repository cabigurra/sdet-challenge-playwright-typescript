FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

ENV PORT=3000
EXPOSE 3000

# A single worker is mandatory: each gunicorn worker holds its own in-memory
# database, so multiple workers would break dev/prod data isolation.
CMD ["gunicorn", "--bind", "0.0.0.0:3000", "--workers", "1", "--threads", "4", "app:app"]
