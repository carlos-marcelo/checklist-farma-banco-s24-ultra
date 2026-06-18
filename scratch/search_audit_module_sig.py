import pathlib
import re

app_content = pathlib.Path('components/auditoria/AuditModule.tsx').read_text(encoding='utf-8')

idx = app_content.find('export default')
if idx != -1:
    print(app_content[idx:idx+500])
else:
    print("Not found")

idx2 = app_content.find('function AuditModule')
if idx2 != -1:
    print(app_content[idx2:idx2+500])
else:
    print("Not found")

# What are the props of AuditModule?
idx3 = app_content.find('export function ')
if idx3 != -1:
    print(app_content[idx3:idx3+500])
