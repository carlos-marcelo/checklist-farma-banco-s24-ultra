import pathlib
import re

content = pathlib.Path('components/auditoria/AuditModule.tsx').read_text(encoding='utf-8')
print("Length:", len(content))

for m in re.finditer(r'Conferido|countedCost', content, re.IGNORECASE):
    print(content[m.start()-50:m.end()+100])
    print("-" * 50)
