import { createTokenBucketRateLimiter } from "@/lib/rateLimit";

// Sign-in throttling for the Credentials/passkey providers. Both budgets are
// checked *before* the expensive password hash (or passkey crypto), so a flood
// can neither burn CPU nor brute-force a password:
//
//   - per IP: stops one host from spraying attempts (and stops a scrypt
//     CPU-DoS, since we short-circuit before verifyPassword runs). Kept lenient
//     enough that a shared NAT of real users won't trip it.
//   - per account: stops a distributed guess against one victim even when the
//     attacker rotates source IPs. The bucket refills continuously, so a burst
//     of wrong guesses only *slows* an account for a few minutes rather than
//     hard-locking it — and Google/passkey sign-in stay unaffected regardless.
//
// In-memory and per-process, like the route limiters: fine for the single
// prod droplet; a multi-instance deploy would move this to a shared store.

export type LoginThrottleScope = "ip" | "account";
export type LoginThrottleResult =
  | { allowed: true }
  | { allowed: false; scope: LoginThrottleScope };

export type LoginThrottleOptions = {
  ipLimit?: number;
  ipWindowMs?: number;
  accountLimit?: number;
  accountWindowMs?: number;
};

export function createLoginThrottle({
  ipLimit = 20,
  ipWindowMs = 5 * 60_000,
  accountLimit = 8,
  accountWindowMs = 15 * 60_000,
}: LoginThrottleOptions = {}) {
  const perIp = createTokenBucketRateLimiter({ limit: ipLimit, windowMs: ipWindowMs });
  const perAccount = createTokenBucketRateLimiter({
    limit: accountLimit,
    windowMs: accountWindowMs,
  });

  return function check(
    ip: string,
    accountKey: string | null,
    now = Date.now(),
  ): LoginThrottleResult {
    if (!perIp(`ip:${ip}`, now).allowed) return { allowed: false, scope: "ip" };
    // Only spend an account token once the IP budget has allowed the attempt, so
    // an IP-blocked flood can't also exhaust a victim's account budget.
    if (accountKey && !perAccount(`account:${accountKey}`, now).allowed) {
      return { allowed: false, scope: "account" };
    }
    return { allowed: true };
  };
}

/** Process-wide login throttle shared by every Credentials provider. */
export const checkLoginThrottle = createLoginThrottle();
