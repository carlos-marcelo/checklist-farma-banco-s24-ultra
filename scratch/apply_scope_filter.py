import pathlib

# Let's write the python patch script to apply scope filtering to both files.

app_path = 'App.tsx'
app_content = pathlib.Path(app_path).read_text(encoding='utf-8')

# In App.tsx:
# We will match the start of `const pools: any[] = [];` and replace the loop body.

old_target_app = """                const pools: any[] = [];
                Object.entries(termDrafts || {}).forEach(([draftKey, draftValue]: [string, any]) => {
                    if (draftValue?.excelMetrics && !draftValue?.excelMetricsRemovedAt) {
                        pools.push(draftValue.excelMetrics);
                        
                        // Marcar categorias cobertas"""

new_target_app = """                const isItemInScope = (item: any, draftKey: string, groupsList: any[]) => {
                    const normalizeTextLocal = (value: unknown) =>
                        String(value ?? '')
                            .normalize('NFD')
                            .replace(/[\u0300-\u036f]/g, '')
                            .toLowerCase()
                            .replace(/\s+/g, ' ')
                            .trim();

                    if (draftKey.startsWith('custom|')) {
                        const match = draftKey.match(/^custom\|([^|]*)(?:\|(.*))?$/);
                        const scopesPart = typeof match?.[2] === 'string' ? match[2] : (match?.[1] || '');
                        const allowedCatIds = new Set<string>();
                        scopesPart.split(',').filter(Boolean).forEach(scopeKey => {
                            const [g, d, c] = scopeKey.split('|');
                            const expanded = getScopeCategoriesLocal(groupsList, g, d, c);
                            expanded.forEach(cat => allowedCatIds.add(cat.id));
                        });
                        return item.catId ? allowedCatIds.has(item.catId) : false;
                    }

                    const [type, groupId, deptId, catId] = draftKey.split('|');
                    if (!type) return true;

                    const scopeCategories = getScopeCategoriesLocal(groupsList, groupId || undefined, deptId || undefined, catId || undefined);
                    const allowedCatIds = new Set(
                        scopeCategories.map(cat => cat.id)
                    );

                    if (item.catId && allowedCatIds.has(item.catId)) return true;

                    return scopeCategories.some(cat => 
                        normalizeTextLocal(item.catName) === normalizeTextLocal(cat.name || '')
                    );
                };

                const pools: any[] = [];
                Object.entries(termDrafts || {}).forEach(([draftKey, draftValue]: [string, any]) => {
                    if (draftValue?.excelMetrics && !draftValue?.excelMetricsRemovedAt) {
                        const cleanItems = (draftValue.excelMetrics.items || []).filter((item: any) => {
                            return isItemInScope(item, draftKey, groups);
                        });
                        pools.push({ ...draftValue.excelMetrics, items: cleanItems });
                        
                        // Marcar categorias cobertas"""

if old_target_app in app_content:
    app_content = app_content.replace(old_target_app, new_target_app)
    print("App.tsx replaced successfully!")
else:
    old_target_app_rn = old_target_app.replace('\n', '\r\n')
    if old_target_app_rn in app_content:
        app_content = app_content.replace(old_target_app_rn, new_target_app.replace('\n', '\r\n'))
        print("App.tsx replaced successfully (CRLF)!")
    else:
        print("Error: App.tsx target not found")

pathlib.Path(app_path).write_text(app_content, encoding='utf-8')


# In components/auditoria/AuditModule.tsx:
audit_path = 'components/auditoria/AuditModule.tsx'
audit_content = pathlib.Path(audit_path).read_text(encoding='utf-8')

old_target_audit = """            const pools: any[] = [];
            Object.entries(termDrafts || {}).forEach(([draftKey, draftValue]) => {
                if (draftValue?.excelMetrics && !draftValue?.excelMetricsRemovedAt) {
                    pools.push(draftValue.excelMetrics);
                    
                    // Marcar categorias cobertas"""

new_target_audit = """            const isItemInScope = (item: any, draftKey: string, groupsList: any[]) => {
                const normalizeTextLocal = (value: unknown) =>
                    String(value ?? '')
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .toLowerCase()
                        .replace(/\s+/g, ' ')
                        .trim();

                if (draftKey.startsWith('custom|')) {
                    const match = draftKey.match(/^custom\|([^|]*)(?:\|(.*))?$/);
                    const scopesPart = typeof match?.[2] === 'string' ? match[2] : (match?.[1] || '');
                    const allowedCatIds = new Set<string>();
                    scopesPart.split(',').filter(Boolean).forEach(scopeKey => {
                        const [g, d, c] = scopeKey.split('|');
                        const expanded = getScopeCategoriesLocal(g, d, c);
                        expanded.forEach(cat => allowedCatIds.add(cat.id));
                    });
                    return item.catId ? allowedCatIds.has(item.catId) : false;
                }

                const [type, groupId, deptId, catId] = draftKey.split('|');
                if (!type) return true;

                const scopeCategories = getScopeCategoriesLocal(groupId || undefined, deptId || undefined, catId || undefined);
                const allowedCatIds = new Set(
                    scopeCategories.map(cat => cat.id)
                );

                if (item.catId && allowedCatIds.has(item.catId)) return true;

                return scopeCategories.some(cat => 
                    normalizeTextLocal(item.catName) === normalizeTextLocal(cat.name || '')
                );
            };

            const pools: any[] = [];
            Object.entries(termDrafts || {}).forEach(([draftKey, draftValue]) => {
                if (draftValue?.excelMetrics && !draftValue?.excelMetricsRemovedAt) {
                    const cleanItems = (draftValue.excelMetrics.items || []).filter((item: any) => {
                        return isItemInScope(item, draftKey, data.groups);
                    });
                    pools.push({ ...draftValue.excelMetrics, items: cleanItems });
                    
                    // Marcar categorias cobertas"""

if old_target_audit in audit_content:
    audit_content = audit_content.replace(old_target_audit, new_target_audit)
    print("AuditModule.tsx replaced successfully!")
else:
    old_target_audit_rn = old_target_audit.replace('\n', '\r\n')
    if old_target_audit_rn in audit_content:
        audit_content = audit_content.replace(old_target_audit_rn, new_target_audit.replace('\n', '\r\n'))
        print("AuditModule.tsx replaced successfully (CRLF)!")
    else:
        print("Error: AuditModule.tsx target not found")

pathlib.Path(audit_path).write_text(audit_content, encoding='utf-8')
