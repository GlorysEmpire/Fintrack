/**
 * Trends — month by month: am I spending more or less of what I earn, and am I
 * following my plan? Every number comes from deterministic maths over recorded
 * transactions (see lib/performance.ts); nothing here is guessed.
 */
import { redirect } from "next/navigation";
import { formatMoney, type CurrencyCode, type MonthPerformance } from "@fintrack/domain";
import { getSessionUser } from "@/lib/auth";
import { getPerformance } from "@/lib/performance";
import { formatExact } from "@/lib/money-format";
import { unreadCount } from "@/lib/inbox";
import { AppShell } from "@/components/AppShell";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

const RATE_REASON: Record<string, string> = {
  no_records: "no records",
  no_income: "no income recorded",
  month_in_progress: "month in progress",
};

const th = { textAlign: "right" as const, padding: "6px 8px", fontWeight: 600, whiteSpace: "nowrap" as const };
const td = { textAlign: "right" as const, padding: "6px 8px", whiteSpace: "nowrap" as const };

export default async function TrendsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.onboarding === "pending") redirect("/onboarding");

  const [view, inboxUnread] = await Promise.all([getPerformance(user), unreadCount(user.id)]);
  const base = view.baseCurrency as CurrencyCode;
  const money = (n: number) => formatMoney(n, base);
  const rows = [...view.months].reverse(); // newest first
  const c = view.comparison;
  const anyConverted = view.months.some((m) => m.converted);

  return (
    <AppShell baseCurrency={user.baseCurrency} email={user.email} inboxUnread={inboxUnread}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Trends</h1>
      <p className="sub">
        Are you spending more or less of what you earn, and following your plan
        more consistently? These are plain calculations from what you have
        recorded, not estimates.
      </p>

      {view.months.length === 0 ? (
        <div className="card">
          <p>Nothing to compare yet.</p>
          <p className="muted" style={{ marginTop: 4 }}>
            Log some income and expenses and your month-by-month picture appears here.
          </p>
        </div>
      ) : (
        <>
          <div className="card" role="status">
            <div className="card-t">Expense rate over time</div>
            <p style={{ marginTop: 6 }}>{view.trend.explanation}</p>
          </div>

          <div className="card">
            <div className="card-t">This month so far, compared fairly</div>
            <p className="muted" style={{ marginTop: 4 }}>{c.note}</p>
            <div style={{ overflowX: "auto", marginTop: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <caption className="muted" style={{ textAlign: "left", fontSize: 12 }}>
                  Income and expenses, {user.baseCurrency}
                </caption>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: "left" }} scope="col">Period</th>
                    <th style={th} scope="col">Income</th>
                    <th style={th} scope="col">Expenses</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row" style={{ ...td, textAlign: "left", fontWeight: 600 }}>
                      {monthLabel(c.currentMonth)}, days 1 to {c.throughDay}
                    </th>
                    <td style={td}>{money(c.current.income)}</td>
                    <td style={td}>{money(c.current.expenses)}</td>
                  </tr>
                  <tr>
                    <th scope="row" style={{ ...td, textAlign: "left", fontWeight: 400 }}>
                      {monthLabel(c.previousMonth)}, same days
                    </th>
                    <td style={td}>{money(c.previousSamePeriod.income)}</td>
                    <td style={td}>{money(c.previousSamePeriod.expenses)}</td>
                  </tr>
                  <tr className="muted">
                    <th scope="row" style={{ ...td, textAlign: "left", fontWeight: 400 }}>
                      {monthLabel(c.previousMonth)}, whole month
                    </th>
                    <td style={td}>{money(c.previousFull.income)}</td>
                    <td style={td}>{money(c.previousFull.expenses)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="sec">Month by month</div>
          <div className="card" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <caption className="muted" style={{ textAlign: "left", fontSize: 12, paddingBottom: 6 }}>
                Amounts in {user.baseCurrency}. Newest month first.
              </caption>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: "left" }} scope="col">Month</th>
                  <th style={th} scope="col">Income</th>
                  <th style={th} scope="col">Expenses</th>
                  <th style={th} scope="col">Expense rate</th>
                  <th style={th} scope="col">Surplus</th>
                  <th style={th} scope="col">Plan followed</th>
                  <th style={th} scope="col">Retained</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m: MonthPerformance) => (
                  <tr key={m.month} style={{ borderTop: "1px solid var(--border, rgba(128,128,128,.2))" }}>
                    <th scope="row" style={{ ...td, textAlign: "left", fontWeight: 600 }}>
                      {monthLabel(m.month)}
                      {m.inProgress && (
                        <div className="muted" style={{ fontSize: 12, fontWeight: 400 }}>
                          in progress: day {m.daysElapsed} of {m.daysInMonth}
                        </div>
                      )}
                      {!m.hasRecords && (
                        <div className="muted" style={{ fontSize: 12, fontWeight: 400 }}>
                          no records
                        </div>
                      )}
                    </th>
                    <td style={td}>{m.hasRecords ? money(m.income) : "—"}</td>
                    <td style={td}>{m.hasRecords ? money(m.expenses) : "—"}</td>
                    <td style={td}>
                      {m.expenseRate === null ? (
                        <span className="muted">— ({RATE_REASON[m.rateNote]})</span>
                      ) : (
                        <>
                          {Math.round(m.expenseRate)}%
                          {m.rateNote === "month_in_progress" && (
                            <div className="muted" style={{ fontSize: 12 }}>so far</div>
                          )}
                        </>
                      )}
                    </td>
                    <td style={td}>
                      {m.hasRecords ? (
                        <>
                          {m.surplus < 0 ? "−" : ""}
                          {money(Math.abs(m.surplus))}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={td}>
                      {m.planAdherence === null ? "—" : `${Math.round(m.planAdherence)}%`}
                      {m.bucketsBelowZero > 0 && (
                        <div className="muted" style={{ fontSize: 12 }}>
                          {m.bucketsBelowZero} bucket{m.bucketsBelowZero === 1 ? "" : "s"} below zero
                        </div>
                      )}
                      {m.crossBucketSpends > 0 && (
                        <div className="muted" style={{ fontSize: 12 }}>
                          {m.crossBucketSpends} cross-bucket
                        </div>
                      )}
                    </td>
                    <td style={td}>
                      {money(m.retained)}
                      {m.retainedChange !== null && Math.abs(m.retainedChange) >= 0.5 && (
                        <div className="muted" style={{ fontSize: 12 }}>
                          {m.retainedChange > 0 ? "+" : "−"}
                          {money(Math.abs(m.retainedChange))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {anyConverted && (
              <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                Some months include other currencies, converted at your saved exchange rates.
              </p>
            )}
          </div>

          {view.accountMovement.length > 0 && (
            <>
              <div className="sec">Where your money moved</div>
              {view.accountMovement.map((mv) => (
                <div className="card" key={mv.month}>
                  <div className="card-t">{monthLabel(mv.month)}</div>
                  {mv.accounts.length === 0 ? (
                    <p className="muted">No accounts were open this month.</p>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                        <thead>
                          <tr>
                            <th style={{ ...th, textAlign: "left" }} scope="col">Account</th>
                            <th style={th} scope="col">Start</th>
                            <th style={th} scope="col">End</th>
                            <th style={th} scope="col">Change</th>
                            <th style={{ ...th, textAlign: "left" }} scope="col">Why</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mv.accounts.map((a) => {
                            const signed = (n: number) => `${n < 0 ? "−" : ""}${formatExact(n, a.currency)}`;
                            const why = [
                              a.income ? `income ${formatExact(a.income, a.currency)}` : "",
                              a.expenses ? `spending ${formatExact(a.expenses, a.currency)}` : "",
                              a.transfersIn ? `transfers in ${formatExact(a.transfersIn, a.currency)}` : "",
                              a.transfersOut ? `transfers out ${formatExact(a.transfersOut, a.currency)}` : "",
                              a.fees ? `fees ${formatExact(a.fees, a.currency)}` : "",
                              a.adjustments ? `adjustments ${signed(a.adjustments)}` : "",
                            ].filter(Boolean);
                            return (
                              <tr key={a.accountId} style={{ borderTop: "1px solid var(--border, rgba(128,128,128,.2))" }}>
                                <th scope="row" style={{ ...td, textAlign: "left", fontWeight: 600 }}>
                                  {a.name}
                                  {a.openedThisMonth && <div className="muted" style={{ fontSize: 12, fontWeight: 400 }}>opened this month</div>}
                                </th>
                                <td style={td}>{signed(a.start)}</td>
                                <td style={td}>{signed(a.end)}</td>
                                <td style={td}>{signed(a.net)}</td>
                                <td style={{ ...td, textAlign: "left", whiteSpace: "normal" }} className="muted">
                                  {why.length ? why.join(" · ") : "no movement"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
              {view.unassignedCount > 0 && (
                <p className="muted" style={{ fontSize: 13 }}>
                  {view.unassignedCount} transaction{view.unassignedCount === 1 ? " is" : "s are"} not assigned to an
                  account, so {view.unassignedCount === 1 ? "it does" : "they do"} not appear in account movement.
                </p>
              )}
            </>
          )}

          <div className="sec">How to read these numbers</div>
          <div className="card">
            <ul style={{ paddingLeft: 18, display: "grid", gap: 6 }}>
              {view.limits.map((l) => (
                <li key={l} className="muted">{l}</li>
              ))}
            </ul>
          </div>
        </>
      )}
    </AppShell>
  );
}
