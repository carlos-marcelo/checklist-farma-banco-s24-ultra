import pathlib

app_path = 'App.tsx'
content = pathlib.Path(app_path).read_text(encoding='utf-8')

# Let's find:
#             branches.push({
#                 branch: branchLabel,
#                 area: branchToArea.get(branchLabel) || 'Sem ...',
# ...
#                 countedUnits,
# ...
#                 countedCost,

# We can replace:
#                 countedUnits,
# with:
#                 countedUnits: countedUnits + diffQty,
# and:
#                 countedCost,
# with:
#                 countedCost: countedCost + diffCost,

# Let's check how many times "countedUnits," is inside branches.push block.
# Actually, let's look at the exact block:
original_push_block_1 = """            branches.push({
                branch: branchLabel,
                area: branchToArea.get(branchLabel) || 'Sem \xef\xbf\xbdrea',
                auditNumber: Number(session.audit_number || 0),
                updatedAt: String(session.updated_at || session.created_at || ''),
                progressPct,
                totalSkus,
                countedSkus,
                pendingSkus,
                totalUnits,
                countedUnits,
                pendingUnits,
                totalCost,
                pendingCost,
                diffQty,
                diffCost,
                countedCost,
                divergencePct,
                termsWithExcel
            });"""

# Let's write a robust python replacement using find/replace that handles whatever encoding 'Sem ...rea' has.
# We can find where `branches.push` is and replace `countedUnits,` and `countedCost,` in that specific context.

import re

# We want to replace inside `branches.push({ ... })`
def replacement_func(match):
    block = match.group(0)
    block = block.replace("countedUnits,", "countedUnits: countedUnits + diffQty,")
    block = block.replace("countedCost,", "countedCost: countedCost + diffCost,")
    return block

# Let's find all `branches.push({ ... })` containing `countedUnits,` and `countedCost,`
pattern = r'branches\.push\(\{\s*branch:[\s\S]*?\}\);'
new_content, count = re.subn(pattern, replacement_func, content)
print(f"Replaced {count} occurrences.")

if count == 2:
    pathlib.Path(app_path).write_text(new_content, encoding='utf-8')
    print("App.tsx successfully updated!")
else:
    print("Error: Could not find/replace exactly 2 occurrences of branches.push block.")
