import pathlib
import re

app_content = pathlib.Path('components/auditoria/AuditModule.tsx').read_text(encoding='utf-8')

idx = app_content.find('supabase')
count = 0
while idx != -1 and count < 10:
    start = max(0, idx - 200)
    end = min(len(app_content), idx + 800)
    print(app_content[start:end])
    print("-" * 50)
    idx = app_content.find('supabase', idx + 1)
    count += 1
