# hospitalManagementFrontEnd

The web app of the Hospital Management System (React + Vite). Every role panel (front office,
doctor, nurse, cashier, pharmacy, lab, HR, finance and the rest) and the patient portal run from
here; the API lives in the
[hospitalManagementBackend](https://github.com/Pushkar9829/hospitalManagementBackend) repository.

## Run it locally

```bash
npm ci
HMS_API_URL=http://localhost:4010 npm run dev -- --port 5180
```

Open `http://demo.localhost:5180` (the part before `.localhost` picks the hospital). The API must
be running; see the backend README for its database, seed data and demo logins.

## Scripts

| Command                | What it does                                                          |
| ---------------------- | --------------------------------------------------------------------- |
| `npm run dev`          | Development server (proxies `/api` and `/socket.io` to `HMS_API_URL`) |
| `npm run build`        | Production build into `dist/`, with the initial JavaScript size check |
| `npm test`             | Unit and screen tests (Vitest), plus the UI kit and translations      |
| `npm run lint`         | ESLint                                                                |
| `npm run format:check` | Prettier check                                                        |

## Layout

- `src/` – the app: shell, routing, role panels, one folder per module.
- `packages/ui` – the UI kit (tables, forms, shell, patient banner).
- `packages/i18n` – English and Hindi strings for every screen.
- `packages/shared` – a copy of the backend's shared package (permissions, catalogue, schemas).
  It is refreshed from the backend with `npm run sync:shared` when both repositories sit side by
  side as `api/` and `web/`; a test fails if the two drift apart.

## Deploy

`vercel.json` builds with Vite and rewrites `/api` and `/socket.io` to the API on Render
(`https://hms-api.onrender.com`). Change that address there if the API runs elsewhere.
