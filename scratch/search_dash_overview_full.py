import pathlib
import re

app_content = pathlib.Path('App.tsx').read_text(encoding='utf-8')

idx = app_content.find('const dashboardCompletedAuditOverview = useMemo')
idx2 = app_content.find('return {', idx)
idx3 = app_content.find('summary: {', idx2)
idx4 = app_content.find('},', idx3)

if idx != -1:
    print(app_content[idx:idx+8000])
