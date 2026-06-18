import pathlib
import re

content = pathlib.Path('components/auditoria/AuditModule.tsx').read_text(encoding='utf-8')
lines = content.splitlines()

for i, line in enumerate(lines):
    if 'branchMetrics.doneCost' in line or 'branchMetrics.doneUnits' in line:
        print(f"Line {i+1}: {line}")
