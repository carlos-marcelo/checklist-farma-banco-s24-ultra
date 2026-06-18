import pathlib
import re

# We will implement deduplication logic using a helper function in python that modifies both files.
# For each file, we want to replace the segment that loops over termDrafts items with:
# 1. Collecting all valid excelMetrics pools
# 2. Applying local mergeExcelMetricsPools
# 3. Iterating over unique items.

# Let's write the python patch script.

helper_functions = """            const normalizeDigitsLocal = (value: unknown) => String(value ?? '').replace(/\D/g, '').replace(/^0+/, '');
            const normalizeScopeIdLocal = (value: unknown) => String(value ?? '').trim().toLowerCase();
            const normalizeTextLocal = (value: unknown) =>
                String(value ?? '')
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .toLowerCase()
                    .replace(/\s+/g, ' ')
                    .trim();

            const mergeExcelMetricsPoolsLocal = (poolsList: any[]) => {
                const validPools = (poolsList || []).filter(Boolean);
                if (validPools.length === 0) return null;
                if (validPools.length === 1) return validPools[0];

                const uniqueItems = new Map<string, any>();
                validPools.forEach((pool: any) => {
                    (Array.isArray(pool?.items) ? pool.items : []).forEach((it: any) => {
                        const keyObj = {
                            code: normalizeDigitsLocal(it?.code || it?.reducedCode),
                            groupId: normalizeScopeIdLocal(it?.groupId),
                            deptId: normalizeScopeIdLocal(it?.deptId),
                            catId: normalizeScopeIdLocal(it?.catId),
                            groupName: normalizeTextLocal(it?.groupName),
                            deptName: normalizeTextLocal(it?.deptName),
                            catName: normalizeTextLocal(it?.catName),
                            sysQty: Number(it?.sysQty || 0),
                            countedQty: Number(it?.countedQty || 0),
                            diffQty: Number(it?.diffQty || 0),
                            sysCost: Number(it?.sysCost || 0),
                            countedCost: Number(it?.countedCost || 0),
                            diffCost: Number(it?.diffCost || 0)
                        };
                        const key = JSON.stringify(keyObj);
                        if (!uniqueItems.has(key)) uniqueItems.set(key, it);
                    });
                });
                return { items: Array.from(uniqueItems.values()) };
            };"""

app_path = 'App.tsx'
app_content = pathlib.Path(app_path).read_text(encoding='utf-8')

# Segment in App.tsx to replace (inside handleExportAllCompletedAuditsExcel)
# We will match the entire block from "// 1. Processar rascunhos de termos que têm excelMetrics"
# until the end of that loop, and replace it.

old_app_block = """                // 1. Processar rascunhos de termos que têm excelMetrics
                Object.entries(termDrafts || {}).forEach(([draftKey, draftValue]: [string, any]) => {
                    if (draftValue?.excelMetrics && !draftValue?.excelMetricsRemovedAt && Array.isArray(draftValue.excelMetrics.items)) {
                        draftValue.excelMetrics.items.forEach((item: any) => {
                            const sysQty = Number(item.sysQty || 0);
                            const countedQty = Number(item.countedQty || 0);
                            const diffQty = Number(item.diffQty || 0);
                            const cost = Number(item.cost || 0);
                            const sysCost = Number(item.sysCost || 0);
                            const countedCost = Number(item.countedCost || 0);
                            const diffCost = Number(item.diffCost || 0);

                            let faltaQty = 0;
                            let faltaCost = 0;
                            let sobraQty = 0;
                            let sobraCost = 0;

                            if (diffQty < 0) {
                                faltaQty = Math.abs(diffQty);
                                faltaCost = Math.abs(diffCost);
                            } else if (diffQty > 0) {
                                sobraQty = diffQty;
                                sobraCost = diffCost;
                            }

                            sessionProducts.push({
                                branch: branchLabel,
                                auditNumber: session.audit_number || 0,
                                code: item.code || '',
                                reducedCode: item.reducedCode || '',
                                name: item.description || item.name || '',
                                groupName: item.groupName || 'DIVERSOS (SEM GRUPO)',
                                deptName: item.deptName || 'DIVERSOS (SEM DEPARTAMENTO)',
                                catName: item.catName || 'DIVERSOS (SEM CATEGORIA)',
                                cost,
                                sysQty,
                                countedQty,
                                diffQty,
                                sysCost,
                                countedCost,
                                diffCost,
                                faltaQty,
                                faltaCost,
                                sobraQty,
                                sobraCost,
                                status: diffQty === 0 ? 'CORRETO' : (diffQty < 0 ? 'FALTA' : 'SOBRA')
                            });
                        });

                        // Marcar categorias cobertas
                        if (draftKey.startsWith('custom|')) {
                            const match = draftKey.match(/^custom\|([^|]*)(?:\|(.*))?$/);
                            const scopesPart = typeof match?.[2] === 'string' ? match[2] : (match?.[1] || '');
                            scopesPart.split(',').filter(Boolean).forEach(scopeKey => {
                                const [g, d, c] = scopeKey.split('|');
                                const expanded = getScopeCategoriesLocal(groups, g, d, c);
                                expanded.forEach(cat => coveredCategories.add(cat.id));
                            });
                        } else {
                            const [type, g, d, c] = draftKey.split('|');
                            if (type && type !== 'custom') {
                                const expanded = getScopeCategoriesLocal(groups, g || undefined, d || undefined, c || undefined);
                                expanded.forEach(cat => coveredCategories.add(cat.id));
                            }
                        }
                    }
                });"""

new_app_block = """                // Helper de deduplicacao
                const normalizeDigitsLocal = (value: unknown) => String(value ?? '').replace(/\D/g, '').replace(/^0+/, '');
                const normalizeScopeIdLocal = (value: unknown) => String(value ?? '').trim().toLowerCase();
                const normalizeTextLocal = (value: unknown) =>
                    String(value ?? '')
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .toLowerCase()
                        .replace(/\s+/g, ' ')
                        .trim();

                const mergeExcelMetricsPoolsLocal = (poolsList: any[]) => {
                    const validPools = (poolsList || []).filter(Boolean);
                    if (validPools.length === 0) return null;
                    if (validPools.length === 1) return validPools[0];

                    const uniqueItems = new Map<string, any>();
                    validPools.forEach((pool: any) => {
                        (Array.isArray(pool?.items) ? pool.items : []).forEach((it: any) => {
                            const keyObj = {
                                code: normalizeDigitsLocal(it?.code || it?.reducedCode),
                                groupId: normalizeScopeIdLocal(it?.groupId),
                                deptId: normalizeScopeIdLocal(it?.deptId),
                                catId: normalizeScopeIdLocal(it?.catId),
                                groupName: normalizeTextLocal(it?.groupName),
                                deptName: normalizeTextLocal(it?.deptName),
                                catName: normalizeTextLocal(it?.catName),
                                sysQty: Number(it?.sysQty || 0),
                                countedQty: Number(it?.countedQty || 0),
                                diffQty: Number(it?.diffQty || 0),
                                sysCost: Number(it?.sysCost || 0),
                                countedCost: Number(it?.countedCost || 0),
                                diffCost: Number(it?.diffCost || 0)
                            };
                            const key = JSON.stringify(keyObj);
                            if (!uniqueItems.has(key)) uniqueItems.set(key, it);
                        });
                    });
                    return { items: Array.from(uniqueItems.values()) };
                };

                const pools: any[] = [];
                Object.entries(termDrafts || {}).forEach(([draftKey, draftValue]: [string, any]) => {
                    if (draftValue?.excelMetrics && !draftValue?.excelMetricsRemovedAt) {
                        pools.push(draftValue.excelMetrics);
                        
                        // Marcar categorias cobertas
                        if (draftKey.startsWith('custom|')) {
                            const match = draftKey.match(/^custom\|([^|]*)(?:\|(.*))?$/);
                            const scopesPart = typeof match?.[2] === 'string' ? match[2] : (match?.[1] || '');
                            scopesPart.split(',').filter(Boolean).forEach(scopeKey => {
                                const [g, d, c] = scopeKey.split('|');
                                const expanded = getScopeCategoriesLocal(groups, g, d, c);
                                expanded.forEach(cat => coveredCategories.add(cat.id));
                            });
                        } else {
                            const [type, g, d, c] = draftKey.split('|');
                            if (type && type !== 'custom') {
                                const expanded = getScopeCategoriesLocal(groups, g || undefined, d || undefined, c || undefined);
                                expanded.forEach(cat => coveredCategories.add(cat.id));
                            }
                        }
                    }
                });

                const merged = mergeExcelMetricsPoolsLocal(pools);
                const uniqueExcelItems = merged?.items || [];

                uniqueExcelItems.forEach((item: any) => {
                    const sysQty = Number(item.sysQty || 0);
                    const countedQty = Number(item.countedQty || 0);
                    const diffQty = Number(item.diffQty || 0);
                    const cost = Number(item.cost || 0);
                    const sysCost = Number(item.sysCost || 0);
                    const countedCost = Number(item.countedCost || 0);
                    const diffCost = Number(item.diffCost || 0);

                    let faltaQty = 0;
                    let faltaCost = 0;
                    let sobraQty = 0;
                    let sobraCost = 0;

                    if (diffQty < 0) {
                        faltaQty = Math.abs(diffQty);
                        faltaCost = Math.abs(diffCost);
                    } else if (diffQty > 0) {
                        sobraQty = diffQty;
                        sobraCost = diffCost;
                    }

                    sessionProducts.push({
                        branch: branchLabel,
                        auditNumber: session.audit_number || 0,
                        code: item.code || '',
                        reducedCode: item.reducedCode || '',
                        name: item.description || item.name || '',
                        groupName: item.groupName || 'DIVERSOS (SEM GRUPO)',
                        deptName: item.deptName || 'DIVERSOS (SEM DEPARTAMENTO)',
                        catName: item.catName || 'DIVERSOS (SEM CATEGORIA)',
                        cost,
                        sysQty,
                        countedQty,
                        diffQty,
                        sysCost,
                        countedCost,
                        diffCost,
                        faltaQty,
                        faltaCost,
                        sobraQty,
                        sobraCost,
                        status: diffQty === 0 ? 'CORRETO' : (diffQty < 0 ? 'FALTA' : 'SOBRA')
                    });
                });"""

if old_app_block in app_content:
    app_content = app_content.replace(old_app_block, new_app_block)
    print("App.tsx replaced successfully!")
else:
    # Try with \r\n if file has Windows line endings
    old_app_block_rn = old_app_block.replace('\n', '\r\n')
    if old_app_block_rn in app_content:
        app_content = app_content.replace(old_app_block_rn, new_app_block.replace('\n', '\r\n'))
        print("App.tsx replaced successfully (with CRLF)!")
    else:
        print("Error: Could not find old_app_block in App.tsx")

pathlib.Path(app_path).write_text(app_content, encoding='utf-8')


# Now let's do AuditModule.tsx
audit_path = 'components/auditoria/AuditModule.tsx'
audit_content = pathlib.Path(audit_path).read_text(encoding='utf-8')

old_audit_block = """            // 1. Processar rascunhos de termos que têm excelMetrics
            Object.entries(termDrafts || {}).forEach(([draftKey, draftValue]) => {
                if (draftValue?.excelMetrics && !draftValue?.excelMetricsRemovedAt && Array.isArray(draftValue.excelMetrics.items)) {
                    draftValue.excelMetrics.items.forEach((item: any) => {
                        const sysQty = Number(item.sysQty || 0);
                        const countedQty = Number(item.countedQty || 0);
                        const diffQty = Number(item.diffQty || 0);
                        const cost = Number(item.cost || 0);
                        const sysCost = Number(item.sysCost || 0);
                        const countedCost = Number(item.countedCost || 0);
                        const diffCost = Number(item.diffCost || 0);

                        let faltaQty = 0;
                        let faltaCost = 0;
                        let sobraQty = 0;
                        let sobraCost = 0;

                        if (diffQty < 0) {
                            faltaQty = Math.abs(diffQty);
                            faltaCost = Math.abs(diffCost);
                        } else if (diffQty > 0) {
                            sobraQty = diffQty;
                            sobraCost = diffCost;
                        }

                        allProductsData.push({
                            code: item.code || '',
                            reducedCode: item.reducedCode || '',
                            name: item.description || item.name || '',
                            groupName: item.groupName || 'DIVERSOS (SEM GRUPO)',
                            deptName: item.deptName || 'DIVERSOS (SEM DEPARTAMENTO)',
                            catName: item.catName || 'DIVERSOS (SEM CATEGORIA)',
                            cost,
                            sysQty,
                            countedQty,
                            diffQty,
                            sysCost,
                            countedCost,
                            diffCost,
                            faltaQty,
                            faltaCost,
                            sobraQty,
                            sobraCost,
                            status: diffQty === 0 ? 'CORRETO' : (diffQty < 0 ? 'FALTA' : 'SOBRA')
                        });
                    });

                    // Marcar categorias cobertas
                    if (draftKey.startsWith('custom|')) {
                        const match = draftKey.match(/^custom\|([^|]*)(?:\|(.*))?$/);
                        const scopesPart = typeof match?.[2] === 'string' ? match[2] : (match?.[1] || '');
                        scopesPart.split(',').filter(Boolean).forEach(scopeKey => {
                            const [g, d, c] = scopeKey.split('|');
                            const expanded = getScopeCategoriesLocal(g, d, c);
                            expanded.forEach(cat => coveredCategories.add(cat.id));
                        });
                    } else {
                        const [type, g, d, c] = draftKey.split('|');
                        if (type && type !== 'custom') {
                            const expanded = getScopeCategoriesLocal(g || undefined, d || undefined, c || undefined);
                            expanded.forEach(cat => coveredCategories.add(cat.id));
                        }
                    }
                }
            });"""

new_audit_block = """            // Helper de deduplicacao
            const normalizeDigitsLocal = (value: unknown) => String(value ?? '').replace(/\D/g, '').replace(/^0+/, '');
            const normalizeScopeIdLocal = (value: unknown) => String(value ?? '').trim().toLowerCase();
            const normalizeTextLocal = (value: unknown) =>
                String(value ?? '')
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .toLowerCase()
                    .replace(/\s+/g, ' ')
                    .trim();

            const mergeExcelMetricsPoolsLocal = (poolsList: any[]) => {
                const validPools = (poolsList || []).filter(Boolean);
                if (validPools.length === 0) return null;
                if (validPools.length === 1) return validPools[0];

                const uniqueItems = new Map<string, any>();
                validPools.forEach((pool: any) => {
                    (Array.isArray(pool?.items) ? pool.items : []).forEach((it: any) => {
                        const keyObj = {
                            code: normalizeDigitsLocal(it?.code || it?.reducedCode),
                            groupId: normalizeScopeIdLocal(it?.groupId),
                            deptId: normalizeScopeIdLocal(it?.deptId),
                            catId: normalizeScopeIdLocal(it?.catId),
                            groupName: normalizeTextLocal(it?.groupName),
                            deptName: normalizeTextLocal(it?.deptName),
                            catName: normalizeTextLocal(it?.catName),
                            sysQty: Number(it?.sysQty || 0),
                            countedQty: Number(it?.countedQty || 0),
                            diffQty: Number(it?.diffQty || 0),
                            sysCost: Number(it?.sysCost || 0),
                            countedCost: Number(it?.countedCost || 0),
                            diffCost: Number(it?.diffCost || 0)
                        };
                        const key = JSON.stringify(keyObj);
                        if (!uniqueItems.has(key)) uniqueItems.set(key, it);
                    });
                });
                return { items: Array.from(uniqueItems.values()) };
            };

            const pools: any[] = [];
            Object.entries(termDrafts || {}).forEach(([draftKey, draftValue]) => {
                if (draftValue?.excelMetrics && !draftValue?.excelMetricsRemovedAt) {
                    pools.push(draftValue.excelMetrics);
                    
                    // Marcar categorias cobertas
                    if (draftKey.startsWith('custom|')) {
                        const match = draftKey.match(/^custom\|([^|]*)(?:\|(.*))?$/);
                        const scopesPart = typeof match?.[2] === 'string' ? match[2] : (match?.[1] || '');
                        scopesPart.split(',').filter(Boolean).forEach(scopeKey => {
                            const [g, d, c] = scopeKey.split('|');
                            const expanded = getScopeCategoriesLocal(g, d, c);
                            expanded.forEach(cat => coveredCategories.add(cat.id));
                        });
                    } else {
                        const [type, g, d, c] = draftKey.split('|');
                        if (type && type !== 'custom') {
                            const expanded = getScopeCategoriesLocal(g || undefined, d || undefined, c || undefined);
                            expanded.forEach(cat => coveredCategories.add(cat.id));
                        }
                    }
                }
            });

            const merged = mergeExcelMetricsPoolsLocal(pools);
            const uniqueExcelItems = merged?.items || [];

            uniqueExcelItems.forEach((item: any) => {
                const sysQty = Number(item.sysQty || 0);
                const countedQty = Number(item.countedQty || 0);
                const diffQty = Number(item.diffQty || 0);
                const cost = Number(item.cost || 0);
                const sysCost = Number(item.sysCost || 0);
                const countedCost = Number(item.countedCost || 0);
                const diffCost = Number(item.diffCost || 0);

                let faltaQty = 0;
                let faltaCost = 0;
                let sobraQty = 0;
                let sobraCost = 0;

                if (diffQty < 0) {
                    faltaQty = Math.abs(diffQty);
                    faltaCost = Math.abs(diffCost);
                } else if (diffQty > 0) {
                    sobraQty = diffQty;
                    sobraCost = diffCost;
                }

                allProductsData.push({
                    code: item.code || '',
                    reducedCode: item.reducedCode || '',
                    name: item.description || item.name || '',
                    groupName: item.groupName || 'DIVERSOS (SEM GRUPO)',
                    deptName: item.deptName || 'DIVERSOS (SEM DEPARTAMENTO)',
                    catName: item.catName || 'DIVERSOS (SEM CATEGORIA)',
                    cost,
                    sysQty,
                    countedQty,
                    diffQty,
                    sysCost,
                    countedCost,
                    diffCost,
                    faltaQty,
                    faltaCost,
                    sobraQty,
                    sobraCost,
                    status: diffQty === 0 ? 'CORRETO' : (diffQty < 0 ? 'FALTA' : 'SOBRA')
                });
            });"""

if old_audit_block in audit_content:
    audit_content = audit_content.replace(old_audit_block, new_audit_block)
    print("AuditModule.tsx replaced successfully!")
else:
    # Try with \r\n if file has Windows line endings
    old_audit_block_rn = old_audit_block.replace('\n', '\r\n')
    if old_audit_block_rn in audit_content:
        audit_content = audit_content.replace(old_audit_block_rn, new_audit_block.replace('\n', '\r\n'))
        print("AuditModule.tsx replaced successfully (with CRLF)!")
    else:
        print("Error: Could not find old_audit_block in AuditModule.tsx")

pathlib.Path(audit_path).write_text(audit_content, encoding='utf-8')
