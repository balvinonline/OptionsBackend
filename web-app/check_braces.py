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
        
if stack:
    print('Unmatched { at index:', stack[-1])
    line = text[:stack[-1]].count('\n') + 1
    print('Line:', line)
else:
    print('All braces matched!')
