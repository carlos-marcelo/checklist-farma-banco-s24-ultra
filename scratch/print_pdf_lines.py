import pathlib

content = pathlib.Path('components/auditoria/AuditModule.tsx').read_text(encoding='utf-8')
lines = content.splitlines()

print("PDF lines 5990-6010:")
for i in range(5990, 6010):
    if i < len(lines):
        print(f"{i+1}: {lines[i]}")

print("\nPDF lines 6715-6735:")
for i in range(6715, 6735):
    if i < len(lines):
        print(f"{i+1}: {lines[i]}")
