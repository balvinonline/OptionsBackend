import re

with open("src/ProfessionalDashboard.jsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update navItems
nav_old = '    { label: "Sectors", value: "sectors", icon: <DashboardOutlined /> },\n    { label: "Charts", value: "charts", icon: <LineChartOutlined /> },'
nav_new = '    { label: "Sectors", value: "sectors", icon: <DashboardOutlined /> },\n    { label: "3 indice chart", action: "three-charts", icon: <LineChartOutlined /> },\n    { label: "Indice & Strike chart", value: "charts", icon: <LineChartOutlined /> },'
content = content.replace(nav_old, nav_new)

# 2. Handle item.action in onClick
click_old = '                  onClick={() => {\n                    setView(item.value);\n                  }}'
click_new = '                  onClick={() => {\n                    if (item.action === "three-charts") {\n                      setThreeChartsOpen(true);\n                    } else {\n                      setView(item.value);\n                    }\n                  }}'
content = content.replace(click_old, click_new)

# 3. Remove sidebar-tools
sidebar_tools_start = '<div className="sidebar-tools">'
sidebar_status = '<div className="sidebar-status">'
start_idx = content.find(sidebar_tools_start)
end_idx = content.find(sidebar_status)

if start_idx != -1 and end_idx != -1:
    content = content[:start_idx] + content[end_idx:]
else:
    print("Could not find sidebar-tools boundaries")

# 4. Modify dashboard-actions wrap
actions_old = '<Space className="dashboard-actions" wrap>'
actions_new = '<Space className="dashboard-actions" style={{ flexWrap: "nowrap", overflowX: "auto" }}>'
content = content.replace(actions_old, actions_new)

# 5. Inject Token and Visuals into topbar near user card
usercard_old = '<div className="dashboard-user-card">'
usercard_new = """<div style={{ display: 'flex', alignItems: 'center', gap: 8, borderLeft: '1px solid var(--border-color)', paddingLeft: 8 }}>
                <Button size="small" icon={<ControlOutlined />} onClick={openTokenModal}>Token</Button>
                <Segmented size="small" value={themeMode} onChange={setThemeMode} options={[ { label: "Light", value: "light" }, { label: "Navy", value: "navy" }, { label: "Black", value: "black" } ]} />
              </div>
              <div className="dashboard-user-card">"""
content = content.replace(usercard_old, usercard_new)

with open("src/ProfessionalDashboard.jsx", "w", encoding="utf-8") as f:
    f.write(content)

print("Sidebar changes patched successfully.")
