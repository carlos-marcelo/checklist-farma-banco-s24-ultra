import pathlib

app_content = pathlib.Path('App.tsx').read_text(encoding='utf-8')
lines = app_content.splitlines()

# Search for "branches.push({" in App.tsx again
for i, line in enumerate(lines):
    if "branches.push({" in line:
        print(f"Line {i+1}: {line}")
        for j in range(max(0, i-2), min(len(lines), i+25)):
            print(f"  {j+1}: {lines[j]}")
        print("-" * 50)
