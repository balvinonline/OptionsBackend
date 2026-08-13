import re

with open("src/ProfessionalDashboard.css", "a", encoding="utf-8") as f:
    f.write("\n\n/* BULLETPROOF TOPBAR ALIGNMENT */\n")
    f.write(".dashboard-topbar {\n  display: flex !important;\n  flex-direction: row !important;\n  flex-wrap: nowrap !important;\n  overflow-x: auto !important;\n  align-items: center !important;\n  justify-content: space-between !important;\n  gap: 16px !important;\n}\n")
    f.write(".dashboard-title-block {\n  flex-shrink: 0 !important;\n  white-space: nowrap !important;\n}\n")
    f.write(".dashboard-actions {\n  display: flex !important;\n  flex-direction: row !important;\n  flex-wrap: nowrap !important;\n  align-items: center !important;\n  flex-shrink: 0 !important;\n  gap: 8px !important;\n}\n")
    f.write(".dashboard-actions > div, .dashboard-actions > .ant-space-item {\n  flex-shrink: 0 !important;\n  white-space: nowrap !important;\n}\n")
    f.write(".dashboard-actions .dashboard-index-select {\n  display: flex !important;\n  flex-direction: column !important;\n  align-items: flex-start !important;\n  min-width: 160px !important;\n}\n")
    f.write(".dashboard-actions .dashboard-index-select span {\n  display: block !important;\n  margin-bottom: 2px !important;\n}\n")
    f.write(".dashboard-actions .ant-select {\n  width: 160px !important;\n  min-width: 160px !important;\n}\n")

print("Appended bulletproof CSS.")
