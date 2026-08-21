import sys, re

with open('src/context/MarketContext.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Remove all comments
text = re.sub(r'//.*', '', text)
text = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)
# Remove all strings
text = re.sub(r'"(?:\\.|[^"])*"', '""', text)
text = re.sub(r"'(?:\\.|[^'])*'", "''", text)
text = re.sub(r'`(?:\\.|[^`])*`', '``', text)

stack = []
for i, c in enumerate(text):
    if c == '{': 
        stack.append(i)
    elif c == '}': 
        if stack: stack.pop()
        
for idx in stack:
    line = text[:idx].count('\n') + 1
    print('Unmatched { at line:', line)
