import pathlib
import sys
import re

sys.stdout.reconfigure(encoding='utf-8')
app_content = pathlib.Path('App.tsx').read_text(encoding='utf-8')

# Search for areaMap inside the dashboardCompletedAuditOverview
matches = list(re.finditer(r'dashboardCompletedAuditOverview = useMemo', app_content))
if matches:
    start_idx = matches[0].start()
    idx = app_content.find('const areaMap', start_idx)
    end_idx = app_content.find('return {', idx)
    print(app_content[idx:end_idx])
