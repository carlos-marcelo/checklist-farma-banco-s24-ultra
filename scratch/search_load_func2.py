import pathlib
import re

app_content = pathlib.Path('App.tsx').read_text(encoding='utf-8')

idx = app_content.find('loadCompletedDashboardAuditSessions =')
if idx != -1:
    print(app_content[idx+1500:idx+4500])
else:
    print("Not found")
