# Rockhouse Command Center

A phone-friendly command center for your six pillars, today’s calendar blocks, focus alarms, snooze buttons, and automation hooks.

## Recommended Hosting

Use:

```text
Vercel + Supabase
```

That gives you the right foundation for:

```text
phone access
Google Calendar OAuth
Notion sync
database storage
scheduled jobs
future push notifications
```

Full deployment steps are in [DEPLOY.md](./DEPLOY.md).

## Current App Status

Built:

```text
Installable PWA shell
Vercel serverless API routes
Live alert engine while the app is open
Snooze/focus alarms
Six core pillars
Supabase schema
Calendar and Notion integration hooks
```

Still to wire:

```text
Google Calendar OAuth
Notion database fetch
Supabase persistence
Push notifications when app is closed
```

## Local Preview

You can still open:

```text
index.html
```

For Vercel-style API testing, install the Vercel CLI and run:

```bash
vercel dev
```

## cPanel Fallback

cPanel support still exists through:

```text
cpanel/.htaccess
cpanel/api/*.php
```

But for your phone-based live command center, Vercel + Supabase is the better long-term path.
