import pathlib

app_content = pathlib.Path('App.tsx').read_text(encoding='utf-8')

idx = app_content.find('POR ÁREA')
if idx != -1:
    print(app_content[max(0, idx-500):idx+1500])
