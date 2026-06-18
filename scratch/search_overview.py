import pathlib
import re

app_content = pathlib.Path('App.tsx').read_text(encoding='utf-8')

matches = list(re.finditer(r'const dashboardCompletedAuditOverview = useMemo', app_content))

for m in matches:
    start = m.start() + 15000
    end = min(len(app_content), m.start() + 30000)
    print(app_content[start:end])
    print("=" * 80)
