import re

with open("src/ProfessionalDashboard.jsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update the view useMemo
view_old = """    if (path === "pcr") return "pcr";"""
view_new = """    if (path === "trade-signals" || path === "trade signals") return "trade-signals";
    if (path === "pcr") return "pcr";"""
content = content.replace(view_old, view_new)

# 2. Update the setView useCallback
setview_old = """    if (newView === "home") navigate("/");"""
setview_new = """    if (newView === "home") navigate("/");
    else if (newView === "trade-signals") navigate("/trade-signals");"""
content = content.replace(setview_old, setview_new)

with open("src/ProfessionalDashboard.jsx", "w", encoding="utf-8") as f:
    f.write(content)

print("Routing fixed for trade-signals")
