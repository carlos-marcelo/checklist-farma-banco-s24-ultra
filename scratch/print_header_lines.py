import pathlib

content = pathlib.Path('components/auditoria/AuditModule.tsx').read_text(encoding='utf-8')
lines = content.splitlines()

for i in range(8055, 8095):
    if i < len(lines):
        print(f"{i+1}: {lines[i]}")
