# omniReports

SEO reporting for omniSEO and its clients. One place for keyword rankings,
Search Console, Google Analytics, Google Business Profile and the links we
build, with a login for each client that shows only their own business.

## What it does

| Area | What you get |
| --- | --- |
| **Rank tracker** | Daily (or weekly, monthly, on demand) Google positions from DataForSEO for desktop and mobile, by country, town or city. Local pack position comes free with every check; Google Maps position is an optional extra. Competitors are tracked from the same searches at no extra cost. Charts, per-keyword history, tags, CSV export. |
| **Search Console** | Clicks, impressions, CTR, average position, top searches and pages, by device and country, compared with the previous period. |
| **Analytics (GA4)** | Sessions, users, key events, engagement, channels and landing pages, with an "organic search only" view. |
| **Business Profile** | Profile views on Search and Maps, calls, website clicks, direction requests, the searches that showed the profile, and recent reviews. |
| **Links** | A log of every link we build: you record them (or paste a whole spreadsheet) and the client sees them straight away. Cost and internal notes stay staff-only. |
| **Reports** | A PDF of any period on demand, plus scheduled weekly or monthly reports by email. |
| **Clients and team** | Staff see every client. Client logins see one business (or several, if you add them to several). Invite links, password resets, admin and staff roles. |
| **Import** | Bring keyword history across from AgencyAnalytics or any other tool by CSV. |

A demo client (a fictional Cardiff plumber with generated data) can be created
from **Settings** to explore the product or show prospects. It is labelled as a
demo everywhere and never calls a paid service.

## Going live

You need accounts with **Vercel** (hosting), **DataForSEO** (rankings),
**Google Cloud** (Search Console, Analytics, Business Profile) and **Resend**
(email). Allow about an hour, plus Google's approval time for Business Profile.

### 1. Deploy to Vercel

1. In Vercel choose **Add New > Project** and import this repository.
2. Under **Storage**, add a **Neon Postgres** database to the project. This sets
   `DATABASE_URL` and `DATABASE_URL_UNPOOLED` for you.
3. Add the environment variables below (Project > Settings > Environment
   Variables), then deploy. The build applies the database schema itself.

| Variable | Value |
| --- | --- |
| `APP_URL` | The address people will use, with no trailing slash, e.g. `https://reports.omniseo.co.uk`. |
| `APP_SECRET` | 64 hex characters. Generate with `openssl rand -hex 32`. Encrypts stored Google tokens. Do not change it later, or every Google account has to be reconnected. |
| `CRON_SECRET` | Any long random string (`openssl rand -hex 24`). Protects the scheduled jobs and is also your one-time setup key. |
| `DATAFORSEO_LOGIN` | API login from [app.dataforseo.com/api-access](https://app.dataforseo.com/api-access). |
| `DATAFORSEO_PASSWORD` | API password from the same page (not your account password). |
| `GOOGLE_CLIENT_ID` | From step 3 below. |
| `GOOGLE_CLIENT_SECRET` | From step 3 below. |
| `RESEND_API_KEY` | From [resend.com](https://resend.com), once your sending domain is verified. |
| `EMAIL_FROM` | e.g. `omniReports <reports@omniseo.co.uk>`. Must be on the verified domain. |

4. Open the site. A new installation sends you to **/setup**: enter the
   `CRON_SECRET` as the setup key and create your admin login. The setup page
   disappears for good once that login exists.
5. Add your own domain in Vercel (Project > Settings > Domains) and make sure
   `APP_URL` matches it exactly.

Everything except the database and `CRON_SECRET` can be added later. The
**Settings** page in the app shows what is and is not connected.

**Scheduled jobs.** `vercel.json` runs three daily jobs: queue rank checks
(03:10 UTC), a safety-net collection of results (05:40 UTC) and scheduled
reports (07:20 UTC). Vercel's Hobby plan only allows daily jobs, which is why
they are daily; Hobby is also for non-commercial use, so plan on Pro. On Pro you
can make the collector more frequent (for example `*/30 * * * *`), though rank
results normally arrive within minutes through the webhook regardless.

### 2. DataForSEO

1. **Verify the account** in the DataForSEO dashboard. Until it is verified the
   API refuses every request with "Please verify your account".
2. **Top up.** New accounts have $1 of trial credit; the minimum top-up is $50.
3. Put the API login and password in the environment variables above.

**What it costs.** DataForSEO bills each page of ten results as one unit:
$0.0006 on the standard queue. Checking a keyword to the top 100 is therefore
ten units, $0.006. As a guide, 30 keywords checked daily to the top 100 is about
$5.50 a month; the same to the top 30 is about $1.65. Each device counts as its
own keyword. "Check now" uses the priority queue at double the price, and
search volume lookups are $0.09 per batch of up to 1,000 keywords. Each client's
settings page shows a live estimate, and **Settings** shows actual spend.
Depth and frequency are set per client.

Results are pushed to `/api/webhooks/dataforseo` as each check finishes. If a
delivery is missed, the collector job picks the result up later.

### 3. Google Cloud

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com).
2. **APIs & Services > Library**: enable
   - Google Search Console API
   - Google Analytics Data API
   - Google Analytics Admin API
   - My Business Account Management API
   - My Business Business Information API
   - Business Profile Performance API
   - Google My Business API (for reviews; only visible after step 6 is approved)
3. **OAuth consent screen**: add the scopes `webmasters.readonly`,
   `analytics.readonly` and `business.manage`.
   - **Internal** (Google Workspace only): no Google review needed, but only
     accounts in your own Workspace can connect. Enough if omniSEO's Google
     account already has access to every client's properties.
   - **External**: needed if clients will connect their own Google accounts.
     Publish the app to **In production**. While it is left in "Testing",
     Google expires every connection after 7 days. These scopes also require
     Google's app verification; until that is done, people see an "unverified
     app" warning and the app is limited to 100 Google accounts.
4. **Credentials > Create credentials > OAuth client ID**, type **Web
   application**. Add the authorised redirect URI shown on the app's
   **Settings** page: `<APP_URL>/api/google/oauth/callback`.
5. Copy the client ID and secret into the environment variables and redeploy.
6. **Business Profile access is by application.** Submit Google's
   [Business Profile API access form](https://developers.google.com/my-business/content/prereqs)
   ("Application for Basic API Access") with the Cloud project number. Google
   says requests are reviewed within 14 days. Until approved the quota is zero
   and omniReports shows a clear "not approved yet" message. Search Console and
   Analytics work without waiting for this.

Then, in the app: **Google accounts > Connect a Google account** for each
omniSEO account, and choose the right property for each client under
**Client settings > Google connections**. A client can also connect their own
account from their dashboard.

### 4. Email (Resend)

Verify your sending domain in Resend, create an API key and set
`RESEND_API_KEY` and `EMAIL_FROM`. Without them nothing is emailed: invite and
reset links can still be copied from the app and sent by hand, and scheduled
reports are recorded as failed with the reason.

## Using it

1. **Clients > Add client.** Name, website, country and timezone.
2. **Rankings > Add keywords.** Paste one per line, choose the search location
   and devices. Add competitors on the Competitors tab.
3. **Client settings > Google connections.** Pick the Search Console,
   Analytics and Business Profile properties.
4. **Links.** Add links as they go live, or use Import to paste a spreadsheet.
5. **Client settings > Client logins.** Invite your contact. They choose a
   password from the link and land on their own dashboard.
6. **Client settings > Scheduled reports.** Send a PDF monthly or weekly.
7. **Client settings > Import history.** Bring across past rankings.

The overview page shows staff a checklist of whichever of these are still to do.

## How access is kept separate

- Every page and data function asks one place, `resolveClientAccess`
  (`src/lib/auth/access.ts`), whether the signed-in person may see a client.
  Staff may see all; a client login only the clients it was added to. A client
  that is not theirs, or does not exist, gives the same 404.
- Staff-only fields (link cost, internal notes) are not selected from the
  database for client logins, and PDFs are always built from the client's view.
- Passwords are hashed with scrypt. Sessions, invite links and reset links are
  stored as hashes. Google tokens are encrypted with AES-256-GCM.
- `test/tenant-isolation.test.ts` checks the separation against a real database.

## Development

Requires Node 22+ and Postgres 14+.

```bash
cp .env.example .env.local   # then fill in DATABASE_URL, APP_SECRET, CRON_SECRET
npm install
npm run db:migrate
npm run create-admin -- you@example.com "Your Name" "a-strong-password"
npm run seed:demo            # optional: the demo client
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app on http://localhost:3000 |
| `npm test` | Unit tests. Set `TEST_DATABASE_URL` (see `.env.test`) to include the database tests. |
| `npm run lint` / `npm run typecheck` | Static checks |
| `npm run build` | Production build |
| `npm run db:generate` | Create a migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |

Set `DATAFORSEO_BASE_URL=https://sandbox.dataforseo.com` to exercise the rank
tracker for free against DataForSEO's dummy data. On `localhost` there is no
public webhook address, so results are collected by polling instead.

### Where things live

```
src/app/(auth)        sign in, first-run setup, invites, password reset
src/app/(app)         the signed-in app: clients, each client's sections, admin
src/app/api           cron jobs, DataForSEO webhook, Google OAuth, PDF and CSV downloads
src/db                database schema (Drizzle) and connection
src/lib/auth          sessions, passwords, the access rules
src/lib/dataforseo    API client and the results parser
src/lib/rank          queueing checks, storing results, queries, CSV import
src/lib/google        OAuth, Search Console, Analytics, Business Profile, response cache
src/lib/links         links-built queries
src/lib/reports       report data, PDF layout, schedules
src/lib/demo          generated data for the demo client
src/components        UI, including the chart kit in components/charts
```

The app is Next.js 16 (App Router, server components and server actions),
TypeScript, Tailwind and Postgres. `AGENTS.md` matters if you use an AI coding
assistant on it: this Next.js version differs from older ones.
