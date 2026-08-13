import re

with open("src/ProfessionalDashboard.css", "a", encoding="utf-8") as f:
    f.write("\n\n/* OVERRIDE FOR PERFECT SINGLE-LINE TOPBAR */\n")
    f.write(".dashboard-topbar {\n  display: flex !important;\n  flex-wrap: nowrap !important;\n  overflow-x: auto !important;\n  align-items: center !important;\n  justify-content: space-between !important;\n}\n")
    f.write(".dashboard-actions {\n  display: flex !important;\n  flex-wrap: nowrap !important;\n  overflow-x: auto !important;\n  align-items: center !important;\n  width: auto !important;\n}\n")
    f.write(".dashboard-actions > .ant-space-item {\n  width: auto !important;\n  flex-shrink: 0 !important;\n}\n")

print("Appended perfect alignment CSS.")
