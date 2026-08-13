with open('src/ProfessionalDashboard.jsx', 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'PCR_TABLE' in line or 'pcrTable' in line or 'renderPcr' in line or 'formatPcrTab' in line:
        print(f"L{i+1}: {line.strip()[:120]}")
