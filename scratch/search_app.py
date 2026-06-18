import pathlib
import re

app_content = pathlib.Path('App.tsx').read_text(encoding='utf-8')
print("File length:", len(app_content))

# Search for the function definition of handleExportAllCompletedAuditsExcel
for m in re.finditer(r'handleExportAllCompletedAuditsExcel', app_content):
    start = max(0, m.start() - 200)
    end = min(len(app_content), m.end() + 200)
    print(f"Match at character {m.start()}:")
    print(app_content[start:end])
    print("-" * 50)

# Also let's find getScopedMetricsLocal or completed audit metrics
for m in re.finditer(r'getScopedMetricsLocal|dashboardCompletedAuditOverview', app_content):
    start = max(0, m.start() - 200)
    end = min(len(app_content), m.end() + 200)
    print(f"Metric match at character {m.start()} for '{m.group(0)}':")
    print(app_content[start:end])
    print("-" * 50)
