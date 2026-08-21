import sys

filepath = "mobile-app/App.js"
with open(filepath, "r") as f:
    text = f.read()

# Add the import
if "MoreMenuScreen" not in text:
    text = text.replace("import { ExpiryScalperScreen } from './src/screens/ExpiryScalperScreen';", "import { ExpiryScalperScreen } from './src/screens/ExpiryScalperScreen';\nimport { MoreMenuScreen } from './src/screens/MoreMenuScreen';")

# Add the View
view_code = """        <View style={[styles.screenWrapper, activeTab === 'More' && !webFeatureParams && !deskSymbol && styles.screenVisible]}>
          {activeTab === 'More' && <MoreMenuScreen onNavigate={setActiveTab} />}
        </View>

        <View style={[styles.screenWrapper,"""
if "activeTab === 'More'" not in text:
    text = text.replace("        <View style={[styles.screenWrapper, activeTab === 'Settings'", view_code)

with open(filepath, "w") as f:
    f.write(text)
