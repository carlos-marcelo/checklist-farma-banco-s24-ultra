import pathlib
import re

app_content = pathlib.Path('App.tsx').read_text(encoding='utf-8')

idx = app_content.find('const dashboardCompletedAuditOverview = useMemo')
if idx != -1:
    block = app_content[idx:idx+25000]
    matches = list(re.finditer(r'\bcountedCost\b', block))
    print(f"Total matches: {len(matches)}")
    for m in matches:
        print(f"Match at character {idx + m.start()}:")
        print(block[max(0, m.start() - 100):min(len(block), m.end() + 100)])
        print("-" * 80)
else:
    print("Not found")
