import sys, re

with open('src/context/MarketContext.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

text = re.sub(r'//.*', '', text)
text = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)
text = re.sub(r'"(?:\\.|[^"])*"', '""', text)
text = re.sub(r"'(?:\\.|[^'])*'", "''", text)
text = re.sub(r'`(?:\\.|[^`])*`', '``', text)

stack_paren = []
for i, c in enumerate(text):
    if c == '(': 
        stack_paren.append(i)
    elif c == ')': 
        if stack_paren: stack_paren.pop()
        
for idx in stack_paren:
    line = text[:idx].count('\n') + 1
    print('Unmatched ( at line:', line)
