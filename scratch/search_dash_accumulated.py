import pathlib

app_content = pathlib.Path('App.tsx').read_text(encoding='utf-8')

idx = app_content.find('accumulatedPct:')
while idx != -1:
    print(app_content[max(0, idx-200):idx+200])
    print("=" * 50)
    idx = app_content.find('accumulatedPct:', idx + 1)
