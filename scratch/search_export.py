import pathlib
import re

app_content = pathlib.Path('App.tsx').read_text(encoding='utf-8')

# Find the start of handleExportAllCompletedAuditsExcel
idx = app_content.find('const handleExportAllCompletedAuditsExcel =')
if idx != -1:
    print(app_content[idx:idx+9000])
else:
    print("Not found")
