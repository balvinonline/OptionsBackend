import re

with open("src/ProfessionalDashboard.jsx", "r", encoding="utf-8") as f:
    content = f.read()

details_old = """          <div className="mt-4 flex gap-4">
            <div className="why-details-grid">"""
details_new = """          <div className="mt-4 flex gap-4">
            <details style={{ width: '100%', cursor: 'pointer', outline: 'none' }}>
              <summary style={{ padding: '10px 16px', background: 'var(--section-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px' }}>▼ View Full Detailed Checklist</summary>
              <div className="why-details-grid mt-3">"""
content = content.replace(details_old, details_new)

details_end_old = """              <div><span>Data Age</span><b>{whyFreshness?.label || "Data Stale"}</b></div>
            </div>
            {whySetup.warnings?.length ? ("""
details_end_new = """              <div><span>Data Age</span><b>{whyFreshness?.label || "Data Stale"}</b></div>
            </div>
            </details>
            {whySetup.warnings?.length ? ("""
content = content.replace(details_end_old, details_end_new)

with open("src/ProfessionalDashboard.jsx", "w", encoding="utf-8") as f:
    f.write(content)
print("Added details wrapper to why-details-grid")
