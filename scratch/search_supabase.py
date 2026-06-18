import pathlib
import re

content = pathlib.Path('supabaseService.ts').read_text(encoding='utf-8')
print("Length:", len(content))

for m in re.finditer(r'sessions|from\(', content, re.IGNORECASE):
    print(content[m.start()-50:m.end()+100])
    print("-" * 50)
