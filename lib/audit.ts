import { newId, pool, ready } from "@/lib/db";
import { clientIpFromHeaders } from "@/lib/rateLimit";
import { logger, maskIp } from "@/lib/logger";

// Durable, account-centric security events, persisted to the security_events
// table (created in lib/db's bootstrap). Distinct from the operational logs in
// lib/logger: those are ephemeral journald lines for debugging; these are
// queryable rows answering "who did what, when, from where" — failed logins,
// registrations, share-link lifecycle.
//
// High-volume signals like rate-limit blocks deliberately stay in the logs
// only — a row per blocked request would amplify the very flood we defend
// against.
export type SecurityEvent =
  | "login.success"
  | "login.failure"
  | "register"
  | "share.create"
  | "share.revoke";

export type AuditContext = {
  userId?: string | null;
  /** Request headers, used to derive a masked client IP + capped user-agent. */
  headers?: Headers;
  meta?: Record<string, unknown>;
};

export type AuditRow = {
  id: string;
  ts: number;
  event: SecurityEvent;
  userId: string | null;
  ip: string | null;
  userAgent: string | null;
  meta: Record<string, unknown>;
};

const MAX_UA = 256;
const log = logger.child({ module: "audit" });

// Pure — exported for tests. The IP is masked to its network (never the full
// host) and the user-agent is capped so a hostile client can't bloat the table.
export function buildAuditRow(
  id: string,
  ts: number,
  event: SecurityEvent,
  ctx: AuditContext,
): AuditRow {
  const rawIp = ctx.headers ? clientIpFromHeaders(ctx.headers) : null;
  const ip = rawIp && rawIp !== "unknown" ? maskIp(rawIp) : null;
  const userAgent = ctx.headers?.get("user-agent")?.slice(0, MAX_UA) ?? null;
  return {
    id,
    ts,
    event,
    userId: ctx.userId ?? null,
    ip,
    userAgent,
    meta: ctx.meta ?? {},
  };
}

// Best-effort: writes the event row and mirrors it to the operational log.
// Never throws — audit logging must not break the request it observes. Call
// sites fire-and-forget (`void recordSecurityEvent(...)`); the prod server is
// long-lived, so the insert completes after the handler returns.
export async function recordSecurityEvent(
  event: SecurityEvent,
  ctx: AuditContext = {},
): Promise<void> {
  const row = buildAuditRow(newId(), Date.now(), event, ctx);
  log.info(event, { userId: row.userId, ip: row.ip, ...row.meta });
  try {
    await ready();
    await pool().query(
      `INSERT INTO security_events (id, ts, event, user_id, ip, user_agent, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [row.id, row.ts, row.event, row.userId, row.ip, row.userAgent, JSON.stringify(row.meta)],
    );
  } catch (err) {
    log.error("failed to record security event", { event, err });
  }
}
