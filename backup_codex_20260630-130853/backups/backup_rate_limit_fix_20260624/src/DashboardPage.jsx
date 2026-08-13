import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const API = "http://127.0.0.1:5000/api/dashboard";

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(API);
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      setData(await r.json());
    } catch (e) {
      setErr(e.message || "Failed");
    } finally {
      setLoading(false);
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
  }, []);

  return (
    <div style={{ padding: 16, color: "white", background: "#071a26", minHeight: "100vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ margin: 0 }}>Index & Future Analysis Dashboard</h2>
        <div style={{ opacity: 0.85 }}>{data?.timestamp ? new Date(data.timestamp).toLocaleString("en-IN") : ""}</div>
      </div>

      {err ? <div style={{ marginTop: 10, background: "#7f1d1d", padding: 10, borderRadius: 10 }}>{err}</div> : null}

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, minmax(260px, 1fr))", gap: 12 }}>
        {(data?.items || []).map((it) => (
          <div key={it.index} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 16, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontWeight: 900, fontSize: 18 }}>{it.index}</div>
              <div style={{ fontSize: 12, opacity: 0.9 }}>VIX: <b>{Number(it.vix || 0).toFixed(2)}</b></div>
            </div>

            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Kpi label="Spot" value={it.spot} />
              <Kpi label="PCR(OI)" value={it.pcr_oi} />
              <Kpi label="Support" value={(it.support?.[0]?.strike ?? "-")} />
              <Kpi label="Resistance" value={(it.resistance?.[0]?.strike ?? "-")} />
            </div>

            <div style={{ marginTop: 10 }}>
              <Link to={`/index/${it.index}`} style={{ color: "#38bdf8", fontWeight: 800, textDecoration: "none" }}>
                View {it.index} →
              </Link>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, opacity: 0.85 }}>
        {loading ? "Updating..." : "Live"}
      </div>
    </div>
  );
}

function Kpi({ label, value }) {
  return (
    <div style={{ background: "rgba(0,0,0,0.25)", padding: 10, borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 16, fontWeight: 900 }}>{format(value)}</div>
    </div>
  );
}

function format(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? "-");
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}