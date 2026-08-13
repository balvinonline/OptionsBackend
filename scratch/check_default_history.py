with open('backend/server.py', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

import re
matches = re.findall(r'def default_dashboard_history[^\n]+\n(?:[ \t]+[^\n]+\n){1,20}', text)
print("default_dashboard_history:", matches)
