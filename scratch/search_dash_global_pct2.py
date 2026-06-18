import pathlib

app_content = pathlib.Path('App.tsx').read_text(encoding='utf-8')

idx = app_content.find('CONFERIDO ACUMULADO')
if idx != -1:
    print(app_content[max(0, idx-500):idx+1000])
