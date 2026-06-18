import pathlib

content = pathlib.Path('App.tsx').read_text(encoding='utf-8')
lines = content.splitlines()

print("Block 1 (around 6183):")
for idx in range(6174, 6205):
    print(f"{idx+1}: {lines[idx]}")

print("\nBlock 2 (around 6761):")
for idx in range(6752, 6783):
    print(f"{idx+1}: {lines[idx]}")
