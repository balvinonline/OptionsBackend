import re

with open("src/ProfessionalDashboard.css", "a", encoding="utf-8") as f:
    f.write("\n\n/* OVERRIDE TO PREVENT CRUSHING OF ITEMS */\n")
    f.write(".dashboard-actions .dashboard-index-select,\n")
    f.write(".dashboard-actions .ant-select,\n")
    f.write(".dashboard-actions .ant-btn,\n")
    f.write(".dashboard-actions .ant-segmented,\n")
    f.write(".dashboard-actions .header-clock,\n")
    f.write(".dashboard-actions .header-vix-pill {\n")
    f.write("  width: auto !important;\n")
    f.write("  min-width: max-content !important;\n")
    f.write("}\n")
    f.write(".dashboard-actions .dashboard-index-select {\n")
    f.write("  min-width: 168px !important;\n")
    f.write("}\n")
    
print("Appended anti-crush CSS.")
