# Deployment Checklist

## Before first deploy
- [ ] All Required env vars set in Replit Secrets (see .env.example)
- [ ] Stripe webhook endpoint configured: POST https://<your-domain>/api/webhooks/stripe (legacy alias: /api/webhook/stripe)
- [ ] Stripe webhook events enabled: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted, invoice.payment_failed
- [ ] Object Storage bucket provisioned (run setup once via Replit Object Storage tool)
- [ ] Database schema applied: npm run db:push
- [ ] APP_URL set to your deployed domain (not localhost)

## Deployment mode
Use **Reserved VM**, not Autoscale. See DEPLOY.md§Deployment Mode below.

## Deployment mode: Reserved VM

The app runs long-lived background workers that must not be duplicated across instances:
- Catalog seeder (LibriVox, Gutenberg, Open Library, Internet Archive)
- Notification scheduler
- Ad platform daily spend reset cron
- Runtime API refresh (every 30 min)

Autoscale spins up a fresh process per request. Each process would start its own seeder, creating duplicate DB writes and excessive external API usage. Reserved VM gives one persistent process where background workers run exactly once.

Move to Autoscale only after these workers are extracted to a separate cron service or queue.

## CDN migration (future)
The following should move to an external CDN at audiobook scale:
- AI-generated book covers (currently in object storage — add CloudFront/Cloudflare in front)
- Static cover images fetched from external catalogs (currently proxied at runtime)
- Podcast episode audio streams (currently proxied through the app server — high bandwidth)
- Visual Reading background videos (currently served from client/public/videos — move to CDN)
- Offline download assets for Premium users (currently served through app server)

At 10K+ concurrent users, serving binary audio and image content through the Express process will become the bottleneck. The object storage proxy in server/replit_integrations/object_storage/routes.ts should be replaced with signed CDN URLs.
