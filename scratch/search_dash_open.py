import pathlib

app_content = pathlib.Path('App.tsx').read_text(encoding='utf-8')

idx = app_content.find('dashboardOpenAuditOverview')
if idx != -1:
    print(app_content[idx:idx+1500])
