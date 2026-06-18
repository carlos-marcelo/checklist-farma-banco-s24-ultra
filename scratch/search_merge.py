import pathlib
import re

app_content = pathlib.Path('App.tsx').read_text(encoding='utf-8')

# Find the start of mergeExcelMetricsPools
idx = app_content.find('const mergeExcelMetricsPools =')
if idx != -1:
    print(app_content[idx:idx+3000])
else:
    print("Not found")
