import pathlib
import re

app_content = pathlib.Path('components/auditoria/AuditModule.tsx').read_text(encoding='utf-8')

# Let's find "const branchMetrics = " or how it's calculated
idx = app_content.find('const branchMetrics')
while idx != -1:
    print(app_content[idx-200:idx+800])
    print("-" * 50)
    idx = app_content.find('const branchMetrics', idx + 1)
