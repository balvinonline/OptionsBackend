import sys, re

with open('src/context/MarketContext.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

text = re.sub(r'//.*', '', text)
text = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)
text = re.sub(r'"(?:\\.|[^"])*"', '""', text)
text = re.sub(r"'(?:\\.|[^'])*'", "''", text)
text = re.sub(r'`(?:\\.|[^`])*`', '``', text)

lines = text.split('\n')
depth = 0
for i, line in enumerate(lines):
    if 135 <= i <= 1189:
        d = line.count('{') - line.count('}')
        if d != 0:
            print(f'Line {i+1}: delta {d}')
