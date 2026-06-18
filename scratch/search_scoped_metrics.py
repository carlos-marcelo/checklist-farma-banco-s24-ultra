import pathlib
import re

app_content = pathlib.Path('App.tsx').read_text(encoding='utf-8')

# Let's find getScopedMetricsLocal and print around character 310000 to 320000
idx = app_content.find('const getScopedMetricsLocal =')
if idx != -1:
    print(app_content[idx:idx+8000])
else:
    print("Not found")
