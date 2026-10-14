# Travel

Personal trip planner for the local network. A trip is the span from the day you leave through the day you come back.

This app does not use the finance database, vault, or net-worth math. Trip budgets and PTO stay here.

## Run

```bash
make travel-install
make travel-dev
```

Open `http://<this-machine>:8090`. The dev server listens on `0.0.0.0` so other devices on your LAN can reach it. Do not port-forward it to the public internet.

Set `TRAVEL_ACCESS_TOKEN` before starting if you want a passphrase. Set `FLIGHTAWARE_API_KEY` or save a key in Settings for flight lookup. Without a key, type the flight yourself.

Docker, still LAN-only:

```bash
docker compose -f apps/travel/docker-compose.yml up --build
```

SQLite file: `apps/travel/backend/travel.db` in dev, `data/travel.db` in Docker.

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
