import pathlib
import re

content = pathlib.Path('components/auditoria/AuditModule.tsx').read_text(encoding='utf-8')
idx = content.find('const filialTotalsMetrics =')
if idx != -1:
    print(content[idx:idx+3000])
else:
    print("Not found")
