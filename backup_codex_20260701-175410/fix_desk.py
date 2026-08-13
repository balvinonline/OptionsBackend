with open("current_desk.txt", "r", encoding="utf-8") as f:
    current_desk = f.read()

with open("backup_desk.txt", "r", encoding="utf-8") as f:
    backup_desk = f.read()

with open("src/ProfessionalDashboard.jsx", "r", encoding="utf-8") as f:
    content = f.read()

if current_desk in content:
    content = content.replace(current_desk, backup_desk)
    
    with open("src/ProfessionalDashboard.jsx", "w", encoding="utf-8") as f:
        f.write(content)
    print("Replaced OptionBuyerDesk successfully.")
else:
    print("Could not find current_desk in ProfessionalDashboard.jsx!")
