import pathlib
import re

app_content = pathlib.Path('App.tsx').read_text(encoding='utf-8')

matches = list(re.finditer('const progressPct = totalUnits > 0', app_content))
for m in matches:
    idx = m.start()
    # find the function enclosing this
    func_idx = app_content.rfind('const ', 0, idx)
    print(app_content[func_idx:func_idx+100])
    print(app_content[idx:idx+200])
    print("=" * 50)
