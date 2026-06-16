# Saved tasks — need a decision or access from you

Captured during the autopilot run. Each needs something only you can provide.

## ✅ RESOLVED — Notes recovered + dedicated `keep` DB live
Using `frank@209.38.79.145` + `sudo -u postgres`: your notes were in the **`keep`**
database all along (Vercel used it via the `keep` role; `appuser` was just
permission-locked out, which made earlier probes look empty). Reassigned `keep`
ownership to `appuser`, bootstrapped the latest schema, and pointed both the
droplet and local `.env.local` at `/keep`. 41 notes (7 active) under your Google
ID are now served on keeptxt.com.

## 3. Email + password auth — shipped, NOT deployed (#171)
Per your pivot ("nevermind encryption… use email + password with a verification
email"). Built additively (Google + passkeys untouched): scrypt hashing,
`/signup`, `/api/auth/register` + `/api/auth/verify`, a `password` provider, and
email/password on `/signin`. **To go live you need to:**
- Set `RESEND_API_KEY` + `EMAIL_FROM` on the droplet (else verify links are only
  logged, not emailed). Any SMTP/Resend account works.
- Then redeploy (`scripts/deploy.sh`). I held off deploying so live keeptxt.com
  keeps working until you've reviewed.

(Passphrase/auto-encryption requests withdrawn — dropped from the queue.)

## 4. Image uploads
Disabled until storage is configured. Provide DO **Spaces** creds and I'll set
`S3_BUCKET/S3_ENDPOINT/S3_REGION/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY/S3_PUBLIC_BASE_URL`
on the droplet (the storage layer already supports S3).

## 5. Database backups
The self-installed Postgres likely has no automated backups. Recommend DO Managed
Postgres (daily backups + PITR) or a `pg_dump` cron with offsite copy. Your call.

## 6. Auth overhaul (password login + passkeys as 2FA)
Design doc shipped (`docs/auth-redesign.md`, PR #145). Awaiting your answers to its
open questions before implementation.

## Resolved
- keeptxt.com DNS + TLS (Caddy), Google OAuth client id/secret on the droplet, env audit.
