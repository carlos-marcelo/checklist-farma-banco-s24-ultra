import pathlib
lines = pathlib.Path('App.tsx').read_text(encoding='utf-8').splitlines()
for i in range(1200, 1300):
    print(f"{i+1}: {lines[i]}")
