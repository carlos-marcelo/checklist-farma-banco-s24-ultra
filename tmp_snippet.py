import pathlib
lines = pathlib.Path('components/StockConference.tsx').read_text(encoding='utf-8').splitlines()
for i in range(840, 1050):
    print(f"{i+1}: {lines[i]}")
