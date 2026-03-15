import pathlib
lines = pathlib.Path('supabaseService.ts').read_text(encoding='utf-8').splitlines()
for i in range(60, 120):
    print(f"{i+1}: {lines[i]}")
