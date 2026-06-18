import pathlib

app_content = pathlib.Path('App.tsx').read_text(encoding='utf-8')

idx = app_content.find('let diffQty = 0;')
if idx != -1:
    print(app_content[idx:idx+2500])
