import sys

with open('src/ProfessionalDashboard.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

if 'import ServerSettingsModal' not in content:
    content = content.replace('import React, { useState', 'import ServerSettingsModal from "./components/ServerSettingsModal";\nimport React, { useState')

if 'const [settingsModalVisible, setSettingsModalVisible] = useState(false);' not in content:
    content = content.replace('const [autoRefresh, setAutoRefresh] = useState(true);', 'const [autoRefresh, setAutoRefresh] = useState(true);\n  const [settingsModalVisible, setSettingsModalVisible] = useState(false);')

btn_str = '<Button icon={<SettingOutlined />} onClick={() => setSettingsModalVisible(true)}>Settings</Button>'
if btn_str not in content:
    target_str = '<Button icon={<ReloadOutlined spin={refreshing} />} onClick={manualRefresh}>\n                Refresh\n              </Button>'
    content = content.replace(target_str, btn_str + '\n              ' + target_str)

modal_str = '<ServerSettingsModal visible={settingsModalVisible} onClose={() => setSettingsModalVisible(false)} />'
if modal_str not in content:
    content = content.replace('<div className="dashboard-content">', modal_str + '\n        <div className="dashboard-content">')

with open('src/ProfessionalDashboard.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Settings Modal patched.')
