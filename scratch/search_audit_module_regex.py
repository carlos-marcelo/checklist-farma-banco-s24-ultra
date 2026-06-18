import pathlib
import re

app_content = pathlib.Path('components/auditoria/AuditModule.tsx').read_text(encoding='utf-8')

match = re.search(r'(const|function)\s+AuditModule\b', app_content)
if match:
    idx = match.start()
    print(app_content[idx:idx+1500])
