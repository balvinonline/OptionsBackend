import re

with open('src/ProfessionalDashboard.jsx', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

# Look for view modes or tab states
matches = re.findall(r'(\w+View|\w+Tab|activeView|currentView|viewMode|TAB_ITEMS|NAV_ITEMS|menuKey)', text)
print("State matches:", set(matches))

# Look for routes or menu items
menu_items = re.findall(r'key:\s*["\']([^"\']+)["\']\s*,\s*label:\s*["\']([^"\']+)["\']', text)
print("Menu items:", menu_items[:20])

# Look for Segmented or Tabs items
segmented_items = re.findall(r'options=\{[^}]+\}', text)
for s in segmented_items[:10]:
    print("Segmented:", s[:100])
