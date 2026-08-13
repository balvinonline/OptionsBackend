import sys
with open('src/ProfessionalDashboard.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

target = 'export default function ProfessionalDashboard({ onLogout, currentUser = "Admin" }) {\n  const [themeMode, setThemeMode] = useState(() => {\n    const saved = localStorage.getItem("pro-dashboard-theme") || "light";\n    return saved === "dark" ? "black" : saved;\n  });\n  const [sidebarVisible, setSidebarVisible] = useState(() => localStorage.getItem("pro-dashboard-sidebar") !== "hidden");'

replacement = 'export default function ProfessionalDashboard({ onLogout, currentUser = "Admin" }) {\n  const [settingsModalVisible, setSettingsModalVisible] = useState(false);\n  const [themeMode, setThemeMode] = useState(() => {\n    const saved = localStorage.getItem("pro-dashboard-theme") || "light";\n    return saved === "dark" ? "black" : saved;\n  });\n  const [sidebarVisible, setSidebarVisible] = useState(() => localStorage.getItem("pro-dashboard-sidebar") !== "hidden");'

if target in content:
    content = content.replace(target, replacement)
    with open('src/ProfessionalDashboard.jsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Hook patched successfully!")
else:
    print("Could not find target string!")
