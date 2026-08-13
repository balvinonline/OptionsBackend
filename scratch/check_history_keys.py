with open('backend/server.py', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

import re
matches = re.findall(r'HISTORY_STORE_KEYS\s*=\s*\[[^\]]+\]', text)
print("HISTORY_STORE_KEYS:", matches)

matches2 = re.findall(r'def read_dashboard_history[^\n]+\n(?:[ \t]+[^\n]+\n){1,15}', text)
print("read_dashboard_history:", matches2)
