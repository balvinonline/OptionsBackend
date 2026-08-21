import json
f=open(" dashboard_history.json\)
d=json.load(f)
p=d.get(\pcrHistory\,{})
print(list(p.keys()))
if \NIFTY\ in p: print(len(p[\NIFTY\])); print(p[\NIFTY\][0])
