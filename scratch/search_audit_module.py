import pathlib
import re

app_content = pathlib.Path('components/auditoria/AuditModule.tsx').read_text(encoding='utf-8')

# Let's find AuditModule component definition
idx = app_content.find('export default function AuditModule')
if idx != -1:
    print(app_content[idx:idx+2000])
