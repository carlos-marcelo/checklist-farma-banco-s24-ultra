import pathlib
import re

app_content = pathlib.Path('App.tsx').read_text(encoding='utf-8')

idx = app_content.find('dashboardCompletedAuditSessions')
while idx != -1:
    print(app_content[idx-100:idx+200])
    print("-" * 50)
    idx = app_content.find('dashboardCompletedAuditSessions', idx + 1)
