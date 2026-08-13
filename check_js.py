import requests, re
try:
    html = requests.get('https://optionsbackend.onrender.com/', timeout=10).text
    match = re.search(r'src="/assets/app-(.*?).js"', html)
    if match:
        js = match.group(1)
        print('JS Bundle:', js)
        js_code = requests.get(f'https://optionsbackend.onrender.com/assets/app-{js}.js').text
        print('ErrorBoundary in JS:', 'App Crashed!' in js_code)
    else:
        print('Could not find JS bundle in HTML')
except Exception as e:
    print('Error:', e)
