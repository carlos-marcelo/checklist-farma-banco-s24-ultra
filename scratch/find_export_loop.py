import pathlib

content = pathlib.Path('App.tsx').read_text(encoding='utf-8')
lines = content.splitlines()

# Search for Object.entries(termDrafts || {}).forEach
for i, line in enumerate(lines):
    if "Object.entries(termDrafts || {}).forEach" in line and i < 5000: # We want inside handleExportAllCompletedAuditsExcel
        print(f"Line {i+1}: {line}")
        for j in range(max(0, i-5), min(len(lines), i+60)):
            print(f"  {j+1}: {lines[j]}")
        print("-" * 50)
