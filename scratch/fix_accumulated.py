import pathlib

app_content = pathlib.Path('App.tsx').read_text(encoding='utf-8')

# The code for accumulatedPct is identical in both.
old_str = '''const accumulatedPct = summary.totalUnits > 0
            ? (summary.countedUnits / summary.totalUnits) * 100
            : 0;'''

# Actually, I'll use regex to replace it because we want to use SKUs instead.
import re

matches = list(re.finditer(r'const accumulatedPct = summary\.totalUnits > 0\s*\?\s*\(summary\.countedUnits / summary\.totalUnits\) \* 100\s*:\s*0;', app_content))

if len(matches) == 2:
    # First match is for dashboardAuditOverview
    # Second match is for dashboardCompletedAuditOverview
    
    new_str_1 = '''// Usa SKUs para consistência com o restante do sistema
        const accumulatedPct = summary.totalSkus > 0
            ? (summary.countedSkus / summary.totalSkus) * 100
            : 0;'''
            
    new_str_2 = '''// Usa SKUs para consistência, mas para concluídas já força 100%
        const accumulatedPct = 100;'''
        
    app_content = app_content[:matches[0].start()] + new_str_1 + app_content[matches[0].end():matches[1].start()] + new_str_2 + app_content[matches[1].end():]
    
    pathlib.Path('App.tsx').write_text(app_content, encoding='utf-8')
    print("Replaced successfully!")
else:
    print(f"Found {len(matches)} matches, expected 2.")
