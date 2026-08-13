import re

# 1. Update JSX
jsx_file = "src/ProfessionalDashboard.jsx"
with open(jsx_file, "r", encoding="utf-8") as f:
    jsx_content = f.read()

# Replace the fast-why-cards div
old_why_cards = """                <div className="fast-why-cards" style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "4px" }}>
                  {whyCards.map(item => (
                    <div className={`why-check ${item.tone}`} key={item.label} style={{ minWidth: "220px", flexShrink: 0, padding: "8px", margin: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "bold", color: "inherit", opacity: 0.8 }}>{item.label}</span>
                        <Tag color={item.tone} style={{ margin: 0, padding: "0 6px", fontSize: "10px", lineHeight: "18px" }}>{item.status}</Tag>
                      </div>
                      <p style={{ fontSize: "10px", marginTop: "6px", marginBottom: 0, opacity: 0.9 }}>{item.note}</p>
                    </div>
                  ))}
                </div>"""

new_why_cards = """                <div className="fast-why-cards" style={{ display: "flex", gap: "10px", overflowX: "auto", paddingTop: "12px", paddingBottom: "4px", marginTop: "8px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  {whyCards.map(item => (
                    <div className={`why-fast-card ${item.tone || 'warning'}`} key={item.label} style={{ minWidth: "160px", flexShrink: 0, margin: 0 }}>
                      <span>{item.label}</span>
                      <b>{item.status}</b>
                      <small>{item.note}</small>
                    </div>
                  ))}
                </div>"""

if old_why_cards in jsx_content:
    jsx_content = jsx_content.replace(old_why_cards, new_why_cards)
else:
    print("WARNING: Could not find old_why_cards in JSX")

with open(jsx_file, "w", encoding="utf-8") as f:
    f.write(jsx_content)

# 2. Update CSS
css_file = "src/ProfessionalDashboard.css"
with open(css_file, "r", encoding="utf-8") as f:
    css_content = f.read()

# Add warning color for why-fast-card in dark mode
warning_css = """
.dark .why-fast-card.warning {
  border-left-color: #fbbf24;
  background: linear-gradient(135deg, rgba(180, 83, 9, 0.45), rgba(15, 23, 42, 0.82));
}

.dark .why-fast-card.info {
  border-left-color: #3b82f6;
  background: linear-gradient(135deg, rgba(29, 78, 216, 0.45), rgba(15, 23, 42, 0.82));
}
"""

if ".dark .why-fast-card.warning" not in css_content:
    # Insert it right after .dark .why-fast-card.error
    css_content = css_content.replace(
        """  background: linear-gradient(135deg, rgba(127, 29, 29, 0.58), rgba(15, 23, 42, 0.82));\n}""",
        """  background: linear-gradient(135deg, rgba(127, 29, 29, 0.58), rgba(15, 23, 42, 0.82));\n}""" + warning_css
    )

with open(css_file, "w", encoding="utf-8") as f:
    f.write(css_content)

print("Patch applied")
