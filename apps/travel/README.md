# Travel

Personal trip planner. A trip is the span from the day you leave through the day you come back.

This app does not use the finance database, vault, or net-worth math. Trip budgets and PTO stay here. Sign-in is the finance session: the same `finance_session` cookie that Finance sets.

## Run

Supported host, with Finance:

```bash
docker compose up --build
```

Open `/finance/` and `/travel/` on that origin. The finance API stays at `/api/`, including `/api/health`.

Direct process, without the shared cookie:

```bash
make travel-install
make travel-dev
```

That listens on `0.0.0.0:8090` at `/`. Its sign-in link points at `/auth/login` on that same port, which this process does not serve. Do not port-forward it to the public internet.

Set `FLIGHTAWARE_API_KEY` or save a key in Settings for flight lookup. Without a key, type the flight yourself.

SQLite file: `apps/travel/backend/travel.db` in dev, `data/travel.db` in Docker. Copy `data/travel.db` yourself when you back up; `scripts/backup-db.sh` covers `finance.db`.

## What it stores

- One trip from departure through return, with more than one city when you add them
- Outbound and inbound flights, plus drives, trains, and other rides
- Optional FlightAware AeroAPI lookup (flight number and date only)
- Day plans such as restaurants, with an OpenStreetMap pin when you search an address
- Parking: necessary or not, booked or not, and whether you are parking, dropped off, or picked up
- Budget by outbound flight, inbound flight, and the other costs on the trip
- Notes and reminders
- PTO balance, accrual rate, days a trip will use, and a projection for the morning you leave and the leftover after

PTO accrual is an even daily estimate from the rate you enter. It is not a payroll calendar.

## Tests

```bash
make travel-test
```
