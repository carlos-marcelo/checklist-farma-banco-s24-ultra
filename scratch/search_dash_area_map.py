import pathlib
import sys
import re

sys.stdout.reconfigure(encoding='utf-8')
app_content = pathlib.Path('App.tsx').read_text(encoding='utf-8')

idx = app_content.find('const areaMap = new Map')
if idx != -1:
    print(app_content[idx:idx+2500])
