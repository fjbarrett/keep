import { createHmac } from "crypto";
import { newId, pool, ready } from "@/lib/db";
import { logger } from "@/lib/logger";

// Privacy-first product analytics, written to the analytics_events table. The
// design goal is useful aggregate traffic data with nothing that identifies a
// person: no cookies, no stored IP, dynamic paths reduced to route patterns,
// referrers reduced to a host, and a "visitor" token that is a daily-rotating
// salted hash (so it counts uniques for a day but can't be reversed or linked
// across days). Do Not Track is honored client-side in the beacon.

export type AnalyticsEventType = "pageview";
const log = logger.child({ module: "analytics" });
const MAX_FIELD = 128;

/**
 * Drop the query/hash and collapse dynamic route segments to their pattern, so
 * we store "/note/:id" — never a specific note id or share token.
 */
export function normalizePath(input: string): string {
  let path = (input.split("?")[0].split("#")[0] || "/").trim();
  if (!path.startsWith("/")) path = "/" + path;
  path = path.replace(/^\/note\/[^/]+.*$/, "/note/:id");
  path = path.replace(/^\/p\/[^/]+.*$/, "/p/:token");
  return path.slice(0, MAX_FIELD);
}

/** Referrer reduced to its host; never a path/query. Self-referrals → "internal". */
export function referrerHost(input: string | null | undefined, selfHost?: string): string {
  if (!input) return "direct";
  try {
    const host = new URL(input).host;
    if (!host) return "direct";
    if (selfHost && host === selfHost) return "internal";
    return host.slice(0, MAX_FIELD);
  } catch {
    return "direct";
  }
}

export function deviceFromUA(ua: string | null | undefined): "mobile" | "desktop" {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(ua ?? "") ? "mobile" : "desktop";
}

/**
 * Plausible-style anonymous visitor token: HMAC of (day + ip + ua). It can't be
 * reversed to an IP and rotates every UTC day, so it counts daily uniques
 * without a cookie or a persistent identifier.
 */
export function dailyVisitorHash(ip: string, ua: string, dayStamp: string): string {
  const key = process.env.AUTH_SECRET || "keep-analytics-dev-salt";
  return createHmac("sha256", key).update(`${dayStamp}|${ip}|${ua}`).digest("hex").slice(0, 16);
}

export type AnalyticsInput = {
  type: AnalyticsEventType;
  path: string;
  referrer?: string | null;
  ip: string;
  ua: string;
  selfHost?: string;
  now: number;
};

export type AnalyticsRow = {
  id: string;
  ts: number;
  type: AnalyticsEventType;
  path: string;
  referrer: string;
  visitor: string;
  device: "mobile" | "desktop";
};

// Pure — exported for tests. Assembles the redaction-applied row.
export function buildAnalyticsRow(id: string, input: AnalyticsInput): AnalyticsRow {
  const day = new Date(input.now).toISOString().slice(0, 10);
  return {
    id,
    ts: input.now,
    type: input.type,
    path: normalizePath(input.path),
    referrer: referrerHost(input.referrer, input.selfHost),
    visitor: dailyVisitorHash(input.ip, input.ua, day),
    device: deviceFromUA(input.ua),
  };
}

// Best-effort: records one event. Never throws — analytics must not break a
// request. The raw IP is used only to derive the visitor hash; it is not stored.
export async function recordAnalyticsEvent(input: AnalyticsInput): Promise<void> {
  const row = buildAnalyticsRow(newId(), input);
  try {
    await ready();
    await pool().query(
      `INSERT INTO analytics_events (id, ts, type, path, referrer, visitor, device)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [row.id, row.ts, row.type, row.path, row.referrer, row.visitor, row.device],
    );
  } catch (err) {
    log.error("failed to record analytics event", { err });
  }
}
