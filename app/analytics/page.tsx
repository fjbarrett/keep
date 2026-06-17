import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { Header } from "@/components/Header";
import { getAnalyticsSummary, isAnalyticsOwner, type Tally } from "@/lib/analyticsSummary";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const session = await auth();
  // 404 (not 403) so the page's existence isn't revealed to non-owners.
  if (!isAnalyticsOwner(session?.user?.email)) notFound();

  const s = await getAnalyticsSummary();
  const maxDay = Math.max(1, ...s.perDay.map((d) => d.views));

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-[var(--color-text)]">Analytics</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Last {s.windowDays} days · anonymous page views, no cookies
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Stat label="Page views" value={s.totalViews} />
          <Stat label="Unique visitors" value={s.uniqueVisitors} />
        </div>

        <section className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
            Views per day
          </h2>
          <div className="flex h-32 items-end gap-[3px]">
            {s.perDay.map((d) => (
              <div
                key={d.day}
                title={`${d.day}: ${d.views}`}
                className="flex-1 rounded-t-sm bg-[var(--color-accent)]"
                style={{ height: `${Math.max(2, (d.views / maxDay) * 100)}%`, opacity: d.views ? 1 : 0.25 }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-[var(--color-muted)]">
            <span>{s.perDay[0]?.day}</span>
            <span>{s.perDay[s.perDay.length - 1]?.day}</span>
          </div>
        </section>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <TallyList title="Top pages" rows={s.topPaths} />
          <TallyList title="Top referrers" rows={s.topReferrers} />
        </div>

        <div className="mt-6">
          <TallyList title="Device" rows={s.devices} />
        </div>
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="text-2xl font-semibold text-[var(--color-text)]">{value.toLocaleString()}</div>
      <div className="mt-0.5 text-xs text-[var(--color-muted)]">{label}</div>
    </div>
  );
}

function TallyList({ title, rows }: { title: string; rows: Tally[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">No data yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.label} className="relative flex items-center justify-between gap-3 rounded px-2 py-1 text-sm">
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 rounded bg-[var(--color-surface-hover)]"
                style={{ width: `${(r.count / max) * 100}%` }}
              />
              <span className="relative z-10 truncate text-[var(--color-text)]">{r.label}</span>
              <span className="relative z-10 shrink-0 tabular-nums text-[var(--color-muted)]">
                {r.count.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
