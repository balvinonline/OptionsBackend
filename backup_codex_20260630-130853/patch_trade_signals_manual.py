import re

with open("src/ProfessionalDashboard.jsx", "r", encoding="utf-8") as f:
    content = f.read()

# Try finding the components manually
start_idx = content.find("<CommandOverviewPanel")
end_idx = content.find("<MarketMoversPreview")

if start_idx != -1 and end_idx != -1:
    signals_block = content[start_idx:end_idx]
    
    # Remove from home
    content = content[:start_idx] + content[end_idx:]
    
    # Add as new view right before 'view === "home"'
    home_cond_idx = content.find(') : view === "home" ? (')
    if home_cond_idx != -1:
        new_view = '          ) : view === "trade-signals" ? (\n            <Spin spinning={showHomeSpinner}>\n              <div className="grid gap-4">\n' + signals_block + '              </div>\n            </Spin>\n'
        content = content[:home_cond_idx] + new_view + content[home_cond_idx:]
    else:
        print("Could not find view === 'home'")
else:
    print(f"Could not find blocks. start: {start_idx}, end: {end_idx}")

with open("src/ProfessionalDashboard.jsx", "w", encoding="utf-8") as f:
    f.write(content)

print("Manual patch applied.")
