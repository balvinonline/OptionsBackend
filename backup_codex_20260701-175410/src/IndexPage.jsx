import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";

const BASE = "http://127.0.0.1:5000/api/index";

export default function IndexPage() {
  const { name } = useParams(); // NIFTY/BANKNIFTY/SENSEX
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  async function load() {
    setErr("");
    try {
      const r = await fetch(`${BASE}/${name}?strikecount=25`);
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      setData(await r.json());
    } catch (e) {
      setErr(e.message || "Failed");
    }
  }

  useEffect(() => {
    load();
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
      load();
    }, 2000);
    return () => clearInterval(id);
  }, [name]);

  const topSupport = data?.support || [];
  const topRes = data?.resistance || [];
  const chain = data?.chain || [];

  // ATM: closest strike to spot
  const atm = useMemo(() => {
    if (!data?.spot || !chain.length) return null;
    let best = chain[0];
    let bestDiff = Math.abs(Number(best.strike) - Number(data.spot));
    for (const r of chain) {
      const d = Math.abs(Number(r.strike) - Number(data.spot));
      if (d < bestDiff) { best = r; bestDiff = d; }
    }
    return best?.strike ?? null;
  }, [data?.spot, chain]);

  return (
    <div style={{ padding: 16, color: "white", background: "#071a26", minHeight: "100vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 20 }}>{name} Detail</div>
          <div style={{ marginTop: 6, opacity: 0.85 }}>
            <Link to="/" style={{ color: "#38bdf8", textDecoration: "none", fontWeight: 800 }}>← Back</Link>
          </div>
        </div>
        <div style={{ opacity: 0.9 }}>
          {data?.timestamp ? new Date(data.timestamp).toLocaleString("en-IN") : ""}
        </div>
      </div>

      {err ? <div style={{ marginTop: 10, background: "#7f1d1d", padding: 10, borderRadius: 10 }}>{err}</div> : null}

      {/* KPI strip */}
      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(6, minmax(160px, 1fr))", gap: 10 }}>
        <Kpi label="Spot" value={data?.spot} />
        <Kpi label="VIX" value={data?.vix} />
        <Kpi label="PCR(OI)" value={data?.pcr_oi} />
        <Kpi label="Total CE OI" value={data?.call_oi_total} />
        <Kpi label="Total PE OI" value={data?.put_oi_total} />
        <Kpi label="ATM" value={atm} />
      </div>

      {/* Support / Resistance */}
      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <TableBox title="RESISTANCE (Top CE OI)" rows={topRes} color="#7f1d1d" />
        <TableBox title="SUPPORT (Top PE OI)" rows={topSupport} color="#065f46" />
      </div>

      {/* Option chain table */}
      <div style={{ marginTop: 12, borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.10)" }}>
        <div style={{ padding: 10, background: "rgba(255,255,255,0.04)", fontWeight: 900 }}>
          Option Chain (Strikecount 25)
        </div>

        <div style={{ overflow: "auto", maxHeight: "60vh", background: "rgba(255,255,255,0.03)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
            <thead style={{ position: "sticky", top: 0, background: "rgba(10,25,35,0.98)" }}>
              <tr>
                <Th>CE OI</Th>
                <Th>CE OI Chg</Th>
                <Th>CE Vol</Th>
                <Th>CE LTP</Th>
                <Th>Strike</Th>
                <Th>PE LTP</Th>
                <Th>PE Vol</Th>
                <Th>PE OI Chg</Th>
                <Th>PE OI</Th>
              </tr>
            </thead>
            <tbody>
              {chain.map((r) => {
                const isATM = atm !== null && Number(r.strike) === Number(atm);
                return (
                  <tr key={r.strike} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: isATM ? "rgba(56,189,248,0.08)" : "transparent" }}>
                    <Td>{fmt(r.oi_CE)}</Td>
                    <Td>{fmt(r.oich_CE)}</Td>
                    <Td>{fmt(r.volume_CE)}</Td>
                    <Td>{fmt(r.ltp_CE)}</Td>
                    <Td style={{ fontWeight: 900 }}>{fmt(r.strike)}</Td>
                    <Td>{fmt(r.ltp_PE)}</Td>
                    <Td>{fmt(r.volume_PE)}</Td>
                    <Td>{fmt(r.oich_PE)}</Td>
                    <Td>{fmt(r.oi_PE)}</Td>
                  </tr>
                );
              })}
              {!chain.length ? (
                <tr><Td colSpan={9} style={{ textAlign: "center", padding: 14, opacity: 0.8 }}>No chain data</Td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TableBox({ title, rows, color }) {
  return (
    <div style={{ borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)" }}>
      <div style={{ padding: 10, fontWeight: 900, background: color }}>{title}</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <Th>Strike</Th>
            <Th>OI</Th>
            <Th>LTP</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <Td style={{ fontWeight: 900 }}>{fmt(r.strike)}</Td>
              <Td>{fmt(r.oi)}</Td>
              <Td>{fmt(r.ltp)}</Td>
            </tr>
          ))}
          {!rows.length ? <tr><Td colSpan={3} style={{ padding: 12, opacity: 0.8 }}>No data</Td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

function Kpi({ label, value }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 16, padding: 12 }}>
      <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 18, fontWeight: 900 }}>{fmt(value)}</div>
    </div>
  );
}

function Th({ children }) {
  return <th style={{ textAlign: "left", padding: "10px 10px", fontSize: 12, opacity: 0.85 }}>{children}</th>;
}
function Td({ children, ...rest }) {
  return <td style={{ padding: "10px 10px", fontSize: 13 }} {...rest}>{children}</td>;
}
function fmt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return v ?? "-";
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}