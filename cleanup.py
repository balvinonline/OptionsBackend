import sys
import re
filepath = "mobile-app/src/screens/DashboardScreen.js"
with open(filepath, "r") as f:
    text = f.read()

# Find the first renderSmartActionCard
first = text.find("const renderSmartActionCard = () => {")
if first != -1:
    # Find the second one
    second = text.find("const renderSmartActionCard = () => {", first + 1)
    if second != -1:
        # Delete from the first one up to the second one!
        text = text[:first] + text[second:]

with open(filepath, "w") as f:
    f.write(text)
