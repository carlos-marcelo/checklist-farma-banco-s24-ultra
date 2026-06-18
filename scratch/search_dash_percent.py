import pathlib
import re

app_content = pathlib.Path('App.tsx').read_text(encoding='utf-8')

idx = app_content.find('const dashboardCompletedAuditOverview = useMemo')
if idx != -1:
    print(app_content[idx:idx+2500])
    
idx2 = app_content.find('Rep. Divergência')
while idx2 != -1:
    print(app_content[max(0, idx2-200):idx2+200])
    print("=" * 50)
    idx2 = app_content.find('Rep. Divergência', idx2 + 1)
