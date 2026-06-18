import pathlib
import re

app_content = pathlib.Path('components/auditoria/AuditModule.tsx').read_text(encoding='utf-8')

# Search for the function that loads data from trier
match = re.search(r'(const|function)\s+(load|fetch)\w*\s*\(', app_content)
if match:
    idx = match.start()
    print("Found fetching function:")
    print(app_content[idx:idx+1000])

# Also search for 'Trier API' to find the fetch call
idx2 = app_content.find('fetch(')
if idx2 != -1:
    print("Found fetch call:")
    print(app_content[max(0, idx2-500):idx2+1000])
