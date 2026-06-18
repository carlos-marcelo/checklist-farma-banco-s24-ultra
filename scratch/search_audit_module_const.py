import pathlib
import re

app_content = pathlib.Path('components/auditoria/AuditModule.tsx').read_text(encoding='utf-8')

# Search for AuditModule =
idx = app_content.find('const AuditModule =')
if idx != -1:
    print(app_content[idx:idx+800])
