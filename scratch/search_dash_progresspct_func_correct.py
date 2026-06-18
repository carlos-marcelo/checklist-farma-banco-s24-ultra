import pathlib
import re

app_content = pathlib.Path('App.tsx').read_text(encoding='utf-8')

matches = list(re.finditer('const progressPct = totalUnits > 0', app_content))
for m in matches:
    idx = m.start()
    # find the function enclosing this by searching for 'const [name] = useMemo' backwards
    func_idx = app_content.rfind('useMemo(() => {', 0, idx)
    name_idx = app_content.rfind('const ', 0, func_idx)
    print(app_content[name_idx:name_idx+100])
    print("=" * 50)
