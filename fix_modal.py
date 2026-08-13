import sys
with open('src/ProfessionalDashboard.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add import
import_str = 'import ServerSettingsModal from "./components/ServerSettingsModal";\n'
if import_str not in content:
    content = content.replace('import React, ', import_str + 'import React, ')

# Add Component to JSX
jsx_target = '        {view === "charts" && <DualChartPage'
jsx_str = '        <ServerSettingsModal visible={settingsModalVisible} onClose={() => setSettingsModalVisible(false)} />\n'
if jsx_str not in content:
    content = content.replace(jsx_target, jsx_str + jsx_target)

with open('src/ProfessionalDashboard.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Component and import added!")
