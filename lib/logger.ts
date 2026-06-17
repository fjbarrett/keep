// Structured JSON logger — one event per line so the production logs stay
// greppable. Prod runs as the `keep` systemd service, so stdout/stderr land in
// journald: `journalctl -u keep -o cat | jq` reads these back as objects. No
// dependencies; safe under the Node and Edge runtimes.
//
// Secure by default: before a line is written, any field whose KEY looks like a
// secret (password, token, cookie, auth header, api key, DATABASE_URL, …) is
// replaced with "[redacted]". A careless `logger.info("x", { user })` therefore
// can't spill a password hash or session token into the logs. For PII you want
// a *hint* of (an email, a client IP), use the maskEmail/maskIp helpers at the
// call site — those are deliberate, not automatic.

export type Level = "debug" | "info" | "warn" | "error";
export type Fields = Record<string, unknown>;

const RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

// Read per-call so LOG_LEVEL can be changed without a rebuild and tests can flip
// it. Defaults: everything in dev, info-and-up in production.
function thresholdRank(): number {
  const env = process.env.LOG_LEVEL?.toLowerCase();
  if (env && env in RANK) return RANK[env as Level];
  return process.env.NODE_ENV === "production" ? RANK.info : RANK.debug;
}

// Case-insensitive substring match, so `passwordHash`, `verify_token`,
// `shareToken`, `apiKey` and `DATABASE_URL` are all caught — while innocuous
// keys like `author` or `hashtag` are not (we avoid bare `auth`/`hash`).
const SENSITIVE_KEY =
  /password|passwd|passphrase|secret|token|cookie|authorization|api[_-]?key|credential|database_?url|private[_-]?key|signing[_-]?key/i;
const REDACTED = "[redacted]";
const MAX_DEPTH = 4;

function serializeError(err: unknown) {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { value: String(err) };
}

function redact(value: unknown, depth: number): unknown {
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(v, depth + 1);
  }
  return out;
}

// Exported for tests: builds the redacted, serializable event object.
export function buildEvent(
  level: Level,
  msg: string,
  base: Fields,
  fields?: Fields,
): Fields {
  const merged: Fields = { ...base, ...fields };
  if ("err" in merged) merged.err = serializeError(merged.err);
  const safe = redact(merged, 0) as Fields;
  return { ts: new Date().toISOString(), level, msg, ...safe };
}

function write(level: Level, line: string) {
  const toErr = level === "warn" || level === "error";
  // Prefer the raw stream (Node) so log lines can't interleave with framework
  // console formatting; fall back to console (Edge runtime has no process.std*).
  const stream = toErr ? process.stderr : process.stdout;
  if (stream?.write) stream.write(line + "\n");
  else (toErr ? console.error : console.log)(line);
}

export type Logger = {
  debug(msg: string, fields?: Fields): void;
  info(msg: string, fields?: Fields): void;
  warn(msg: string, fields?: Fields): void;
  error(msg: string, fields?: Fields): void;
  /** Returns a logger that stamps `bindings` onto every line (e.g. a route). */
  child(bindings: Fields): Logger;
};

function emit(level: Level, msg: string, base: Fields, fields?: Fields) {
  if (RANK[level] < thresholdRank()) return;
  write(level, JSON.stringify(buildEvent(level, msg, base, fields)));
}

function make(base: Fields): Logger {
  return {
    debug: (msg, fields) => emit("debug", msg, base, fields),
    info: (msg, fields) => emit("info", msg, base, fields),
    warn: (msg, fields) => emit("warn", msg, base, fields),
    error: (msg, fields) => emit("error", msg, base, fields),
    child: (bindings) => make({ ...base, ...bindings }),
  };
}

export const logger = make({});

/** `frank.barrett@x.com` → `f************@x.com`. Returns [redacted] if not an email. */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return REDACTED;
  const name = email.slice(0, at);
  return `${name.slice(0, 1)}${"*".repeat(name.length - 1)}${email.slice(at)}`;
}

/** Keep the network, drop the host — enough to group abuse without storing the full IP. */
export function maskIp(ip: string): string {
  if (ip.includes(":")) return `${ip.split(":").slice(0, 2).join(":")}::`; // IPv6
  const octets = ip.split(".");
  return octets.length === 4 ? `${octets[0]}.${octets[1]}.x.x` : REDACTED;
}
