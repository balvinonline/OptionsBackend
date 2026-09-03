from pathlib import Path

root = Path(__file__).resolve().parent
server = root / 'server.py'
if not server.exists():
    raise SystemExit('Put this patch next to backend server.py, then run it again.')
text = server.read_text(encoding='utf-8')
marker = 'register_optionsdesk_v195_routes(app)'
if marker not in text:
    insertion = "\n# OptionsDesk v1.9.5 secure mobile auth + Kotak Neo routes\nfrom optionsdesk_v195_routes import register_optionsdesk_v195_routes\nregister_optionsdesk_v195_routes(app)\n\n"
    needle = 'if __name__ == "__main__":'
    if needle not in text:
        raise SystemExit('Could not find server startup marker. Add the register lines manually.')
    text = text.replace(needle, insertion + needle, 1)
    server.write_text(text, encoding='utf-8')
    print('Patched server.py')
else:
    print('server.py already contains v1.9.5 route registration')

req = root / 'requirements.txt'
if req.exists():
    lines = req.read_text(encoding='utf-8').splitlines()
    if not any(line.lower().startswith('kotakneoapi') for line in lines):
        lines.append('kotakneoapi==3.0.1')
        req.write_text('\n'.join(lines).rstrip() + '\n', encoding='utf-8')
        print('Added kotakneoapi==3.0.1 to requirements.txt')
else:
    print('requirements.txt not found; add kotakneoapi==3.0.1 manually')
