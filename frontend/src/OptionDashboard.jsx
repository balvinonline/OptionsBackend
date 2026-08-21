import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Professional Option Chain Dashboard
 * Assumes API response:
 * {
 *   symbol: "NIFTY",
 *   timestamp: "2026-03-05T13:10:00+05:30" OR null,
 *   data: [{ strike: 22500, ce_ltp: 120.5, pe_ltp: 95.2 }, ...]
 * }
 */

const API_URL = "/api/option-chain";
function fmtNum(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "-";
  return x.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function fmtTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN");
}

export default function OptionDashboard() {
  const [symbol, setSymbol] = useState("NIFTY");
  const [refreshSec, setRefreshSec] = useState(10);

  const [rows, setRows] = useState([]);
  const [serverSymbol, setServerSymbol] = useState("");
  const [timestamp, setTimestamp] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const lastOkFetchRef = useRef(null);

  async function fetchData(signal) {
    setLoading(true);
    setError("");

    try {
      const url = new URL(API_URL);
      url.searchParams.set("symbol", symbol); // future-ready (backend ignore kare to ok)

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { "Accept": "application/json" },
        signal,
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status} ${res.statusText}`);
      }

      const json = await res.json();

      const list = Array.isArray(json?.data) ? json.data : [];
      // normalize
      const normalized = list
        .map((r) => ({
          strike: Number(r.strike),
          ce_ltp: Number(r.ce_ltp),
          pe_ltp: Number(r.pe_ltp),
        }))
        .filter((r) => Number.isFinite(r.strike))
        .sort((a, b) => a.strike - b.strike);

      setRows(normalized);
      setServerSymbol(json?.symbol || "");
      setTimestamp(json?.timestamp || null);
      lastOkFetchRef.current = new Date().toISOString();
    } catch (e) {
      if (e?.name === "AbortError") return;
      setError(e?.message || "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }

  // Auto refresh
  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);

    const id = setInterval(() => {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Kolkata",
        weekday: "short",
        hour: "numeric",
        minute: "numeric",
        hour12: false,
      }).formatToParts(new Date());
      const map = {};
      for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
      if (map.weekday === "Sat" || map.weekday === "Sun") return;
      const h = parseInt(map.hour, 10);
      const m = parseInt(map.minute, 10);
      if (h > 15 || (h === 15 && m >= 30)) return;
      const c = new AbortController();
      fetchData(c.signal);
    }, Math.max(3, refreshSec) * 1000);

    return () => {
      controller.abort();
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, refreshSec]);

  // Compute ATM strike (closest strike where |CE-PE| is min OR closest to mid)
  const atmStrike = useMemo(() => {
    if (!rows.length) return null;
    let best = rows[0];
    let bestScore = Math.abs((best.ce_ltp || 0) - (best.pe_ltp || 0));

    for (const r of rows) {
      const score = Math.abs((r.ce_ltp || 0) - (r.pe_ltp || 0));
      if (score < bestScore) {
        best = r;
        bestScore = score;
      }
    }
    return best.strike;
  }, [rows]);

  const stats = useMemo(() => {
    if (!rows.length) return null;

    const maxCE = rows.reduce((a, b) => ((b.ce_ltp ?? 0) > (a.ce_ltp ?? 0) ? b : a), rows[0]);
    const maxPE = rows.reduce((a, b) => ((b.pe_ltp ?? 0) > (a.pe_ltp ?? 0) ? b : a), rows[0]);

    return {
      strikes: rows.length,
      maxCE: { strike: maxCE.strike, ltp: maxCE.ce_ltp },
      maxPE: { strike: maxPE.strike, ltp: maxPE.pe_ltp },
    };
  }, [rows]);

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.title}>Option Chain Dashboard</div>
          <div style={styles.subTitle}>
            API: <span style={styles.mono}>{API_URL}</span>
          </div>
        </div>

        <div style={styles.controls}>
          <div style={styles.control}>
            <label style={styles.label}>Symbol</label>
            <select
              style={styles.select}
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
            >
              <option value="NIFTY">NIFTY</option>
              <option value="BANKNIFTY">BANKNIFTY</option>
            </select>
          </div>

          <div style={styles.control}>
            <label style={styles.label}>Auto refresh</label>
            <select
              style={styles.select}
              value={refreshSec}
              onChange={(e) => setRefreshSec(Number(e.target.value))}
            >
              <option value={5}>5 sec</option>
              <option value={10}>10 sec</option>
              <option value={30}>30 sec</option>
              <option value={60}>60 sec</option>
            </select>
          </div>

          <button
            style={styles.btn}
            onClick={() => {
              const c = new AbortController();
              fetchData(c.signal);
            }}
            disabled={loading}
            title="Refresh now"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Status Bar */}
      <div style={styles.statusBar}>
        <div>
          <span style={{ ...styles.badge, background: error ? "#7f1d1d" : "#064e3b" }}>
            {error ? "ERROR" : "CONNECTED"}
          </span>
          <span style={{ marginLeft: 10 }}>
            Server Symbol: <b>{serverSymbol || symbol}</b>
          </span>
          <span style={{ marginLeft: 16 }}>
            Last Updated: <b>{fmtTime(timestamp || lastOkFetchRef.current)}</b>
          </span>
        </div>
        <div>
          ATM: <b>{atmStrike ?? "—"}</b>
        </div>
      </div>

      {/* Error */}
      {error ? (
        <div style={styles.errorBox}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Could not load data</div>
          <div style={styles.mono}>{error}</div>
          <div style={{ marginTop: 10, opacity: 0.9 }}>
            Tip: Flask me CORS enable karo & backend port 5000 running verify karo.
          </div>
        </div>
      ) : null}

      {/* KPI Cards */}
      <div style={styles.kpiRow}>
        <KpiCard label="Strikes" value={stats?.strikes ?? "—"} />
        <KpiCard label="ATM Strike" value={atmStrike ?? "—"} />
        <KpiCard
          label="Max CE LTP"
          value={stats ? `${stats.maxCE.strike} (${fmtNum(stats.maxCE.ltp)})` : "—"}
        />
        <KpiCard
          label="Max PE LTP"
          value={stats ? `${stats.maxPE.strike} (${fmtNum(stats.maxPE.ltp)})` : "—"}
        />
      </div>

      {/* Table */}
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Strike</th>
              <th style={styles.th}>CE LTP</th>
              <th style={styles.th}>PE LTP</th>
              <th style={styles.th}>Bias</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => {
              const isATM = atmStrike !== null && r.strike === atmStrike;
              const bias =
                (r.ce_ltp || 0) > (r.pe_ltp || 0)
                  ? "CALL heavy"
                  : (r.pe_ltp || 0) > (r.ce_ltp || 0)
                  ? "PUT heavy"
                  : "Balanced";

              return (
                <tr
                  key={r.strike}
                  style={{
                    ...styles.tr,
                    ...(isATM ? styles.trATM : null),
                  }}
                >
                  <td style={{ ...styles.td, fontWeight: isATM ? 900 : 700 }}>
                    {r.strike}
                  </td>
                  <td style={styles.td}>{fmtNum(r.ce_ltp)}</td>
                  <td style={styles.td}>{fmtNum(r.pe_ltp)}</td>
                  <td style={styles.td}>
                    <span
                      style={{
                        ...styles.pill,
                        background:
                          bias === "CALL heavy"
                            ? "#1e3a8a"
                            : bias === "PUT heavy"
                            ? "#7c2d12"
                            : "#374151",
                      }}
                    >
                      {bias}
                    </span>
                  </td>
                </tr>
              );
            })}

            {!rows.length && !loading ? (
              <tr>
                <td style={styles.empty} colSpan={4}>
                  No data received. Check API response `data: []`.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KpiCard({ label, value }) {
  return (
    <div style={styles.kpiCard}>
      <div style={styles.kpiLabel}>{label}</div>
      <div style={styles.kpiValue}>{value}</div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    padding: 16,
    background: "#071a26",
    color: "#e5e7eb",
    fontFamily: "Inter, system-ui, Arial",
  },
  header: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    padding: 14,
    borderRadius: 16,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.10)",
  },
  title: { fontSize: 22, fontWeight: 900, letterSpacing: 0.2 },
  subTitle: { marginTop: 6, fontSize: 12, opacity: 0.85 },
  mono: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" },

  controls: { display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" },
  control: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 12, opacity: 0.85 },
  select: {
    background: "#0b2233",
    border: "1px solid rgba(255,255,255,0.14)",
    color: "#e5e7eb",
    borderRadius: 10,
    padding: "10px 10px",
    outline: "none",
    minWidth: 140,
  },
  btn: {
    background: "#114f69",
    border: "1px solid rgba(255,255,255,0.18)",
    color: "white",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 800,
    cursor: "pointer",
  },

  statusBar: {
    marginTop: 12,
    padding: "10px 12px",
    borderRadius: 14,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.10)",
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
  },
  badge: {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 999,
    fontWeight: 900,
    fontSize: 12,
    border: "1px solid rgba(255,255,255,0.15)",
  },

  errorBox: {
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
    background: "rgba(127,29,29,0.35)",
    border: "1px solid rgba(255,255,255,0.10)",
  },

  kpiRow: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(180px, 1fr))",
    gap: 10,
  },
  kpiCard: {
    padding: 14,
    borderRadius: 16,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.10)",
  },
  kpiLabel: { fontSize: 12, opacity: 0.85, fontWeight: 800 },
  kpiValue: { marginTop: 8, fontSize: 18, fontWeight: 900 },

  tableWrap: {
    marginTop: 12,
    borderRadius: 16,
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.03)",
  },
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    textAlign: "left",
    padding: "12px 12px",
    fontSize: 12,
    opacity: 0.85,
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    letterSpacing: 0.3,
  },
  tr: {
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  trATM: {
    outline: "2px solid rgba(56,189,248,0.35)",
    background: "rgba(56,189,248,0.08)",
  },
  td: { padding: "12px 12px", fontSize: 14 },
  pill: {
    display: "inline-block",
    padding: "5px 10px",
    borderRadius: 999,
    fontWeight: 900,
    fontSize: 12,
    border: "1px solid rgba(255,255,255,0.14)",
  },
  empty: { padding: 14, textAlign: "center", opacity: 0.85 },
};