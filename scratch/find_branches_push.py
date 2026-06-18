import pathlib
import re

app_content = pathlib.Path('App.tsx').read_text(encoding='utf-8')
idx = app_content.find('const dashboardCompletedAuditOverview = useMemo')
if idx != -1:
    block = app_content[idx:idx+25000]
    m = re.search(r'branches\.push\(\{([\s\S]*?)\}\);', block)
    if m:
        # Let's locate the global index
        start_char = idx + m.start()
        end_char = idx + m.end()
        # Find line number
        lines = app_content[:start_char].count('\n') + 1
        print(f"Line: {lines}")
        print(app_content[start_char:end_char])
