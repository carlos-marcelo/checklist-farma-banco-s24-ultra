import pathlib
import re

app_content = pathlib.Path('App.tsx').read_text(encoding='utf-8')

# For dashboardAuditOverview
# We need to find the one inside dashboardAuditOverview.areas.map
idx1 = app_content.find('dashboardAuditOverview.areas.map(area => {')
if idx1 != -1:
    old_str_1 = 'const pct = area.totalUnits > 0 ? (area.countedUnits / area.totalUnits) * 100 : 0;'
    idx_target_1 = app_content.find(old_str_1, idx1)
    if idx_target_1 != -1 and idx_target_1 < idx1 + 500:
        new_str_1 = 'const pct = area.totalSkus > 0 ? (area.countedSkus / area.totalSkus) * 100 : 0;'
        app_content = app_content[:idx_target_1] + new_str_1 + app_content[idx_target_1+len(old_str_1):]
        print("Replaced dashboardAuditOverview.areas.map pct")

# For dashboardCompletedAuditOverview
idx2 = app_content.find('dashboardCompletedAuditOverview.areas.map(area => {')
if idx2 != -1:
    old_str_2 = 'const pct = area.totalUnits > 0 ? (area.countedUnits / area.totalUnits) * 100 : 0;'
    idx_target_2 = app_content.find(old_str_2, idx2)
    if idx_target_2 != -1 and idx_target_2 < idx2 + 500:
        new_str_2 = 'const pct = 100;'
        app_content = app_content[:idx_target_2] + new_str_2 + app_content[idx_target_2+len(old_str_2):]
        print("Replaced dashboardCompletedAuditOverview.areas.map pct")

pathlib.Path('App.tsx').write_text(app_content, encoding='utf-8')
print("Done!")
