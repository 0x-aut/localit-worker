# localit-worker

The background worker that powers Localit's test runs. It listens for new jobs via Supabase Realtime, then handles all the heavy lifting — Playwright screenshots, pixelmatch diffs, missing key scans, and AI analysis.

Source: [github.com/0x-aut/localit-worker](https://github.com/0x-aut/localit-worker)

---

## What it does

When a test run is created in the Localit dashboard, the worker catches the Realtime event from Supabase and starts processing immediately. It runs headless Playwright sessions against the target URL, captures screenshots for each route and locale, runs pixel-level diffs, checks for missing translation keys, and sends AI-generated reports back to the database.

The main app stays lean. All compute-heavy work lives here.

---

## Stack

- **Node.js**
- **Supabase** — Realtime subscriptions, Postgres, Storage
- **Playwright** — headless browser automation
- **pixelmatch** — image diffing
- **Koyeb** — deployed as a persistent worker

---

## Self-hosting

The worker needs a persistent process to keep its Supabase Realtime connection alive. Koyeb is what we use, but any platform that can run a long-lived Node.js process works — Railway, Render, Fly, a plain VPS.

### 1. Clone and install

```bash
git clone https://github.com/0x-aut/localit-worker.git
cd localit-worker
npm install
```

### 2. Configure environment variables

```env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

The worker uses the service role key because it needs write access to update run results and upload screenshots to Storage.

### 3. Run locally

```bash
npm start
```

The worker will connect to Supabase Realtime and start listening for new test run events. Keep the process running — it needs to stay alive to catch events.

### 4. Deploy

Deploy to any platform that supports persistent Node.js processes. Set the environment variables above in your platform's configuration and point the start command at `npm start`.

---

## How it connects to the main app

The worker and the main Localit app share the same Supabase project. The app writes a new row to the `runs` table when a test is triggered. The worker is subscribed to `INSERT` events on that table via Realtime, picks up the job, processes it, and writes results back. The app reads those results in real time from the same database.

No message queue, no separate API. Supabase Realtime is the bridge.

---

## Related repositories

- **Main app** — [github.com/0x-aut/localit](https://github.com/0x-aut/localit)
- **Demo app** — [github.com/0x-aut/localitdemo](https://github.com/0x-aut/localitdemo)