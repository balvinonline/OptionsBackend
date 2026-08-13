with open('backend/server.py', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

import re
routes = re.findall(r'@app\.route\(["\']([^"\']+)["\']', text)
print("All Backend Routes:", sorted(list(set(routes))))
