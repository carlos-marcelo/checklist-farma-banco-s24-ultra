import pathlib

app_content = pathlib.Path('App.tsx').read_text(encoding='utf-8')

idx = app_content.find('const progressPct = totalUnits')
if idx != -1:
    target = app_content[idx:idx+150]
    print(repr(target))
