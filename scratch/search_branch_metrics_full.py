import pathlib
import re

app_content = pathlib.Path('components/auditoria/AuditModule.tsx').read_text(encoding='utf-8')

# Let's find "branchMetrics = useMemo" and get more context
idx = app_content.find('const branchMetrics = useMemo')
if idx != -1:
    print(app_content[idx:idx+1500])
