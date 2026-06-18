import pathlib
import re

content = pathlib.Path('components/auditoria/AuditModule.tsx').read_text(encoding='utf-8')
idx = content.find('branchMetrics')
while idx != -1:
    print(content[idx-100:idx+400])
    print("-" * 50)
    idx = content.find('branchMetrics', idx + 1)
