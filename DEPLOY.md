# Vercel + Supabase Deployment

This is the recommended path for operating the command center from your phone.

## 1. Put The Project On GitHub

Create a GitHub repo and push this folder.

Files Vercel needs:

```text
index.html
src/
api/
icons/
manifest.webmanifest
sw.js
package.json
vercel.json
```

The old cPanel PHP fallback can stay in the repo under `cpanel/`, but Vercel will use the `.js` files in `api/`.

## 2. Create The Vercel App

1. Go to Vercel.
2. Import the GitHub repo.
3. Framework preset: `Other`.
4. Build command: leave blank.
5. Output directory: leave blank.
6. Deploy.

After deploy, your phone URL will look like:

```text
https://rockhouse-command-center.vercel.app
```

## 3. Create Supabase

Created:

```text
Project name: rockhouse-command-center
Project ref:  wknhchyoxyicruatvejo
Project URL:  https://wknhchyoxyicruatvejo.supabase.co
Region:       us-west-1
Cost:         $0/month
```

Already applied:

```text
supabase/schema.sql
```

You still need to copy your service role key from Supabase.

Add these Vercel environment variables:

```text
SUPABASE_URL=https://wknhchyoxyicruatvejo.supabase.co
SUPABASE_SERVICE_ROLE_KEY=
```

Security note: Supabase reported that Row Level Security is currently disabled on the starter tables. Since the current API plan uses server-side Vercel routes with the service role key, we can safely enable RLS later with proper policies. Do not expose the service role key in frontend code.

## 4. Add Google Calendar

Create OAuth credentials in Google Cloud.

Add these Vercel environment variables:

```text
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GOOGLE_CALENDAR_ID=primary
```

The current route [api/calendar/today.js](./api/calendar/today.js) is ready for this wiring. Right now it returns demo data until those values are added and the fetch logic is implemented.

## 5. Add Notion

Create a Notion integration and share your task database with it.

Add these Vercel environment variables:

```text
NOTION_TOKEN=
NOTION_DATABASE_ID=
```

The current route [api/notion/tasks.js](./api/notion/tasks.js) is ready for this wiring. Right now it returns demo data until the Notion fetch logic is implemented.

## 6. Install On Your Phone

Open the Vercel URL on your phone.

On iPhone:

1. Open in Safari.
2. Tap Share.
3. Tap `Add to Home Screen`.
4. Open the new Rockhouse icon.
5. Go to `Connect`.
6. Tap `Enable Live Alerts`.

## 7. What Still Needs To Be Built

Current build:

```text
PWA shell
Vercel API stubs
Supabase schema
Calendar/Notion env hooks
Live alerts while app is open
```

Next build:

```text
Google OAuth flow
Google Calendar event fetch
Notion database fetch
Notion task completion write-back
Push notifications when app is closed
Scheduled sync cron
```
