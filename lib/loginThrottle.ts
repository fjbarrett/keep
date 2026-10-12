import { createTokenBucketRateLimiter } from "@/lib/rateLimit";

// Both limits run before scrypt. The account budget is scoped to its source
// address so failed attempts from one network cannot lock out the owner on
// every device. These in-memory limits assume one application process.

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
    if (accountKey && !perAccount(`account:${JSON.stringify([ip, accountKey])}`, now).allowed) {
      return { allowed: false, scope: "account" };
    }
    return { allowed: true };
  };
}

/** Process-wide login throttle shared by every Credentials provider. */
export const checkLoginThrottle = createLoginThrottle();
