with open('backend/server.py', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

import re
idx = text.find('/api/dashboard-history')
if idx != -1:
    print(text[idx-50:idx+600])
else:
    print("Not found")
