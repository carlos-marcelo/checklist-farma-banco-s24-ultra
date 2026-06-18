import pathlib
import re

content = pathlib.Path('components/auditoria/AuditModule.tsx').read_text(encoding='utf-8')
lines = content.splitlines()

for i, line in enumerate(lines):
    if 'rawTermComparisonMetrics' in line and '=' in line and ('state' in line or 'use' in line):
        print(f"Line {i+1}: {line}")
