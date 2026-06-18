import pathlib
import re

app_content = pathlib.Path('App.tsx').read_text(encoding='utf-8')
idx = app_content.find('const handleExportAllCompletedAuditsExcel =')
if idx != -1:
    print("Found handleExportAllCompletedAuditsExcel in App.tsx")
    print(app_content[idx:idx+1500])
