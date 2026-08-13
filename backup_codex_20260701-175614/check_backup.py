with open('src/ProfessionalDashboard_Backup_Pre_OptionChecks.jsx', 'r', encoding='utf-8') as f:
    c = f.read()

idx = c.find('view === "trade-signals"')
if idx != -1:
    print('Found trade-signals view')
    print(c[idx:idx+500])
