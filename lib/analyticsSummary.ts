import { pool, ready } from "@/lib/db";

const DAY = 86_400_000;

/** Owner gate for the analytics dashboard. Disabled until ANALYTICS_ADMIN_EMAIL is set. */
export function isAnalyticsOwner(email: string | null | undefined): boolean {
  const admin = process.env.ANALYTICS_ADMIN_EMAIL;
  return !!admin && !!email && email.toLowerCase() === admin.toLowerCase();
}

export type DayBucket = { day: string; views: number };
export type Tally = { label: string; count: number };
export type AnalyticsSummary = {
  windowDays: number;
  totalViews: number;
  uniqueVisitors: number;
  perDay: DayBucket[];
  topPaths: Tally[];
  topReferrers: Tally[];
  devices: Tally[];
};

// Pure — exported for tests. Pads the daily series so every day in the window
// is present (zero-filled), oldest → newest, for a continuous chart axis.
export function fillDays(rows: DayBucket[], windowDays: number, now: number): DayBucket[] {
  const byDay = new Map(rows.map((r) => [r.day, r.views]));
  const out: DayBucket[] = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const day = new Date(now - i * DAY).toISOString().slice(0, 10);
    out.push({ day, views: byDay.get(day) ?? 0 });
  }
  return out;
}

export async function getAnalyticsSummary(
  windowDays = 30,
  now = Date.now(),
): Promise<AnalyticsSummary> {
  await ready();
  const since = now - windowDays * DAY;
  const p = pool();
  const where = `WHERE ts >= $1 AND type = 'pageview'`;

  const [totals, perDay, paths, referrers, devices] = await Promise.all([
    p.query<{ views: string; uniques: string }>(
      `SELECT count(*) AS views, count(DISTINCT visitor) AS uniques FROM analytics_events ${where}`,
      [since],
    ),
    p.query<{ day: string; views: string }>(
      `SELECT to_char(to_timestamp(ts / 1000) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
              count(*) AS views
         FROM analytics_events ${where}
         GROUP BY day ORDER BY day`,
      [since],
    ),
    p.query<{ label: string; count: string }>(
      `SELECT coalesce(path, '?') AS label, count(*) AS count FROM analytics_events ${where}
         GROUP BY path ORDER BY count DESC LIMIT 10`,
      [since],
    ),
    p.query<{ label: string; count: string }>(
      `SELECT coalesce(referrer, 'direct') AS label, count(*) AS count FROM analytics_events ${where}
         GROUP BY referrer ORDER BY count DESC LIMIT 10`,
      [since],
    ),
    p.query<{ label: string; count: string }>(
      `SELECT coalesce(device, '?') AS label, count(*) AS count FROM analytics_events ${where}
         GROUP BY device ORDER BY count DESC`,
      [since],
    ),
  ]);

  const tally = (rows: { label: string; count: string }[]): Tally[] =>
    rows.map((r) => ({ label: r.label, count: Number(r.count) }));

  return {
    windowDays,
    totalViews: Number(totals.rows[0]?.views ?? 0),
    uniqueVisitors: Number(totals.rows[0]?.uniques ?? 0),
    perDay: fillDays(
      perDay.rows.map((r) => ({ day: r.day, views: Number(r.views) })),
      windowDays,
      now,
    ),
    topPaths: tally(paths.rows),
    topReferrers: tally(referrers.rows),
    devices: tally(devices.rows),
  };
}
