import pathlib
import re

app_content = pathlib.Path('App.tsx').read_text(encoding='utf-8')

matches = list(re.finditer(r'Conferência Global da Filial', app_content))
for m in matches:
    start = max(0, m.start() - 300)
    end = min(len(app_content), m.start() + 500)
    print(app_content[start:end])
    print("-" * 50)
