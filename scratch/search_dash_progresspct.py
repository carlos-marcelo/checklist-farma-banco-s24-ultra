import pathlib

app_content = pathlib.Path('App.tsx').read_text(encoding='utf-8')

idx = app_content.find('progressPct')
count = 0
while idx != -1 and count < 10:
    print(app_content[max(0, idx-100):idx+200])
    print("=" * 50)
    idx = app_content.find('progressPct', idx + 1)
    count += 1
