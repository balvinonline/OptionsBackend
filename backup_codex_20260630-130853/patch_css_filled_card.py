import re

with open("src/ProfessionalDashboard.css", "r", encoding="utf-8") as f:
    css_content = f.read()

# 1. Update CSS for filled why-summary cards
css_patch = """
.why-summary.success {
  background: #059669 !important;
  color: white !important;
  border-color: #047857 !important;
}
.why-summary.success b, .why-summary.success small, .why-summary.success span {
  color: white !important;
}

.why-summary.error {
  background: #dc2626 !important;
  color: white !important;
  border-color: #991b1b !important;
}
.why-summary.error b, .why-summary.error small, .why-summary.error span {
  color: white !important;
}

.why-summary.warning {
  background: #d97706 !important;
  color: white !important;
  border-color: #b45309 !important;
}
.why-summary.warning b, .why-summary.warning small, .why-summary.warning span {
  color: white !important;
}
"""

if ".why-summary.success {" in css_content:
    css_content = re.sub(r'\.why-summary\.success \{[^}]+\}', '', css_content)
if ".why-summary.error {" in css_content:
    css_content = re.sub(r'\.why-summary\.error \{[^}]+\}', '', css_content)
if ".why-summary.warning {" in css_content:
    css_content = re.sub(r'\.why-summary\.warning \{[^}]+\}', '', css_content)

css_content += css_patch

with open("src/ProfessionalDashboard.css", "w", encoding="utf-8") as f:
    f.write(css_content)

print("CSS updated.")
