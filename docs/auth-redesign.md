# Auth redesign — password login + passkeys as 2FA

Status: **proposal, not yet implemented.** This is the design pass requested
before any code. Nothing here changes behavior until the PRs below land.

## Goals

1. Add **email + password** as a first-class sign-in method (today it's Google
   OAuth + passkey-as-primary).
2. Demote **passkeys to an optional second factor** — they verify an identity
   that was already established by Google or password, rather than logging you
   in from cold.
3. Don't regress existing Google users or anyone who already added a passkey.

## Current state

- `auth.ts` — NextAuth v5 with two providers: `Google`, and a `Credentials`
  provider (`id: "passkey"`) that logs a user in purely from a WebAuthn
  assertion. That assertion-only path is exactly what we're removing as a
  *primary* login.
- `users` table: `id, email, name, updated_at, enc_salt`.
- `authenticators` table already stores passkeys (credential id, public key,
  counter, transports, name) keyed by `user_id`.
- `passkey_challenges` table for WebAuthn challenges.

## Target model

```
            ┌── Google OAuth ──┐
 cold start ┤                  ├─► primary identity established
            └── email+password ┘
                                       │
                       has 2FA enrolled? ── no ──► full session
                                       │
                                      yes
                                       │
                              passkey assertion (step-up)
                                       │
                                  full session
```

### Password storage

Recommendation: **scrypt via Node's built-in `crypto`** (no new dependency,
already used elsewhere in the stack). Store `password_hash` as
`scrypt(password, salt, N)` plus a per-user random `password_salt`; encode
parameters in the stored string (`scrypt$N$r$p$salt$hash`) so they can be
tuned later. Verify with `crypto.timingSafeEqual`.

Alternative if we want a hardened KDF: `@node-rs/argon2` (argon2id). Better
resistance, but adds a native dependency. Default to scrypt unless we decide
the dependency is worth it.

Password rules: min 10 chars, check against a small common-password denylist,
no max that blocks passphrases. Hash on the server only — never send the hash
to the client.

### Schema changes

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;     -- nullable: Google-only users have none
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BIGINT;  -- ms timestamp, nullable
ALTER TABLE users ADD COLUMN IF NOT EXISTS twofa_enabled BOOLEAN NOT NULL DEFAULT false;
-- email must be unique once we let people log in by it:
CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users (lower(email)) WHERE email IS NOT NULL;
```

`twofa_enabled` is derived/asserted: it can only be true if the user has ≥1
row in `authenticators`. Turning on 2FA requires enrolling a passkey first.

### Sign-up flow (new)

- `/signup` page: email, password, confirm.
- `POST /api/auth/register`: validate, ensure email unused, hash password,
  insert user, (optionally) send a verification email. For a portfolio we can
  ship without email verification first and add it as a follow-up — note the
  gap rather than silently skipping it.

### Sign-in flow

- Replace the assertion-only `passkey` credentials provider with a `password`
  credentials provider: `authorize({ email, password })` looks up the user,
  verifies the scrypt hash, returns the user on success.
- Google OAuth unchanged.
- After the primary factor succeeds, if `twofa_enabled`, the session is minted
  in a **pending** state (`session.mfa = "pending"`).

### Step-up 2FA

NextAuth has no built-in step-up, so we model it explicitly:

- JWT/session carries `mfa: "pending" | "ok" | "none"`.
  - `none` — user has no 2FA; full access.
  - `pending` — primary factor done, passkey still required.
  - `ok` — passkey verified this session.
- Middleware (`middleware.ts`) treats `mfa === "pending"` like logged-out for
  everything except `/2fa` and the passkey-assertion API.
- `/2fa` page calls the existing WebAuthn assertion flow; on success, a
  `POST /api/2fa/verify` validates the assertion against the user's
  authenticators and flips the token to `mfa: "ok"` (via the `jwt` callback
  reading a short-lived server marker, since we can't mutate the JWT directly
  from an API route — see "Open questions").
- Passkey **enrollment** stays where it is today (Settings → Security), but
  enabling it now also sets `twofa_enabled = true`.

### Migration / compatibility

- Existing Google users: `password_hash` null, `twofa_enabled` false → they
  keep logging in with Google, no 2FA unless they opt in. No disruption.
- Users who currently rely on **passkey-as-primary**: this is the breaking
  change. They must have a Google account on the same `users.id` (the passkey
  is tied to a `user_id` that originated from a Google sub) — which today they
  do, because passkeys can only be enrolled after a Google sign-in. So they can
  still get in via Google, then use the passkey as 2FA. We should still
  **announce** this in the release notes.

## Security checklist

- Rate-limit `/api/auth/register` and the password `authorize` path (per-IP +
  per-email backoff). We have no rate limiter today — needs one (e.g., a small
  Postgres-backed counter or an edge KV).
- Generic error messages ("email or password is incorrect") — no user
  enumeration.
- `timingSafeEqual` for hash comparison.
- CSRF is handled by NextAuth for its routes; the custom register/2fa routes
  need the same origin checks.
- Consider email verification before first login (deferred, documented).

## Open questions (decide before coding)

1. **scrypt (no dep) vs argon2id (native dep)?** Leaning scrypt.
2. **Email verification at signup** — ship without and add later, or block
   first login until verified?
3. **Flipping `mfa: pending → ok`** cleanly in NextAuth v5 — the tidiest option
   is a short-lived server-side "mfa cleared" marker (row keyed by session id /
   jti) that the `jwt` callback consumes on next request. Confirm this approach
   vs. re-issuing the session.
4. **Is 2FA opt-in or enforced** once a passkey exists? Proposed: opt-in via a
   `twofa_enabled` toggle, defaulting on when the first passkey is added.

## Proposed PR breakdown

1. `feat: password auth` — schema, register endpoint, `/signup`, password
   credentials provider, sign-in page wiring. (No 2FA yet; passkey login path
   left intact so nothing breaks mid-rollout.)
2. `feat: step-up 2FA scaffolding` — `mfa` session state, `/2fa` page,
   `/api/2fa/verify`, middleware gating.
3. `feat: passkeys become 2FA` — remove the assertion-only `passkey` provider,
   wire enrollment to `twofa_enabled`, release notes.
4. `feat: rate limiting + (optional) email verification` — hardening.

Each is < ~300 LOC and independently shippable in that order.
