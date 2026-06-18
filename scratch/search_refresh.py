import pathlib
import re

app_content = pathlib.Path('components/auditoria/AuditModule.tsx').read_text(encoding='utf-8')

idx = app_content.find('const handleRefreshData')
if idx != -1:
    print(app_content[idx:idx+1500])
