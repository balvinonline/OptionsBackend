import sys, re

with open('src/context/MarketContext.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

text = re.sub(r'//.*', '', text)
text = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)
text = re.sub(r'"(?:\\.|[^"])*"', '""', text)
text = re.sub(r"'(?:\\.|[^'])*'", "''", text)
text = re.sub(r'`(?:\\.|[^`])*`', '``', text)

lines = text.split('\n')
p = 0
for i, line in enumerate(lines):
    if 183 <= i <= 345:
        p += line.count('(') - line.count(')')
        if p != 0:
            print(f'Line {i+1}: p {p} -> {line.strip()}')
print('Final p:', p)
