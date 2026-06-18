import pathlib

app_content = pathlib.Path('App.tsx').read_text(encoding='utf-8')

idx = app_content.find('const progressPct =')
count = 0
while idx != -1 and count < 10:
    start = max(0, idx-300)
    end = min(len(app_content), idx+300)
    print(app_content[start:end])
    print("=" * 50)
    idx = app_content.find('const progressPct =', idx + 1)
    count += 1
