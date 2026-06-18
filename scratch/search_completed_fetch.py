import pathlib
import re

app_content = pathlib.Path('App.tsx').read_text(encoding='utf-8')
idx = app_content.find('setIsLoadingCompletedDashboardAudits')
while idx != -1:
    print(app_content[idx-100:idx+400])
    print("-" * 50)
    idx = app_content.find('setIsLoadingCompletedDashboardAudits', idx + 1)
