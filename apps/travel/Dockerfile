# syntax=docker/dockerfile:1
FROM python:3.12-slim

WORKDIR /app
RUN mkdir -p /data

COPY backend/requirements.txt .
RUN pip install --no-cache-dir --no-compile -r requirements.txt

COPY backend /app
COPY --from=tokens tokens.css /app/static/tokens.css

ENV TRAVEL_DATABASE_URL=sqlite:////data/travel.db
EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
