import re

with open("src/ProfessionalDashboard.jsx", "r", encoding="utf-8") as f:
    content = f.read()

# Fix RR hard block
# From: !(isNum(rr) && Number(rr) >= 2) ? "R:R below 1:2" : "",
# To: (isNum(rr) && Number(rr) < 1.5) ? "R:R below 1:1.5" : "",
content = content.replace(
    '!(isNum(rr) && Number(rr) >= 2) ? "R:R below 1:2" : "",',
    '(isNum(rr) && Number(rr) < 1.5) ? "R:R below 1:1.5" : "",'
)

# Fix setup pass minimum (from 0.66 to 0.5)
# From: const setupPassMinimum = Math.ceil(setupChecks.length * 0.66);
# To: const setupPassMinimum = Math.ceil(setupChecks.length * 0.5);
content = content.replace(
    'const setupPassMinimum = Math.ceil(setupChecks.length * 0.66);',
    'const setupPassMinimum = Math.ceil(setupChecks.length * 0.5);'
)

with open("src/ProfessionalDashboard.jsx", "w", encoding="utf-8") as f:
    f.write(content)

print("Patched trade gate logic successfully.")
