import pathlib
import re

content = pathlib.Path('components/auditoria/AuditModule.tsx').read_text(encoding='utf-8')
idx = content.find('setTermComparisonMetrics(nextMetrics)')
if idx != -1:
    print(content[idx-6000:idx-3000])
else:
    print("Not found")
