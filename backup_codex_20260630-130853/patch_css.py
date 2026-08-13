import re

with open("src/ProfessionalDashboard.css", "r", encoding="utf-8") as f:
    css = f.read()

# Change dashboard-topbar from grid to flex with overflow-x auto
css = re.sub(
    r'\.dashboard-topbar\s*\{\s*display:\s*grid;\s*grid-template-columns:[^;]+;',
    '.dashboard-topbar {\n  display: flex;\n  flex-wrap: nowrap;\n  overflow-x: auto;\n  justify-content: space-between;',
    css
)

# Remove grid-template-columns override in media query
css = re.sub(
    r'\.dashboard-topbar\s*\{\s*grid-template-columns:\s*1fr;\s*\}',
    '.dashboard-topbar {\n    flex-direction: column;\n    align-items: flex-start;\n  }',
    css
)

with open("src/ProfessionalDashboard.css", "w", encoding="utf-8") as f:
    f.write(css)

print("Patched ProfessionalDashboard.css")
