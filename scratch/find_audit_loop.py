import pathlib

content = pathlib.Path('components/auditoria/AuditModule.tsx').read_text(encoding='utf-8')
lines = content.splitlines()

for i, line in enumerate(lines):
    if "Object.entries(termDrafts || {}).forEach" in line:
        print(f"Line {i+1}: {line}")
        for j in range(max(0, i-5), min(len(lines), i+60)):
            print(f"  {j+1}: {lines[j]}")
        print("-" * 50)
