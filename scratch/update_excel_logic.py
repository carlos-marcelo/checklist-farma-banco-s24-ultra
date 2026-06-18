import os
import re

app_path = r"c:\Users\marce\Documents\Sites\checklist-farma-banco-s24-ultra\App.tsx"
audit_path = r"c:\Users\marce\Documents\Sites\checklist-farma-banco-s24-ultra\components\auditoria\AuditModule.tsx"

# 1. Atualizar App.tsx
with open(app_path, "r", encoding="utf-8") as f:
    app_content = f.read()

# Vamos achar a definição de handleExportAllCompletedAuditsExcel no App.tsx e reescrevê-la
func_pattern = r"(const handleExportAllCompletedAuditsExcel = \(\) => \{)([\s\S]*?)(};[\s\n]*const handleViewChange)"
match = re.search(func_pattern, app_content)

new_app_func = """const handleExportAllCompletedAuditsExcel = () => {
        if (!dashboardCompletedAuditSessions || dashboardCompletedAuditSessions.length === 0) {
            alert("Nenhum dado de auditoria concluída disponível no momento.");
            return;
        }

        try {
            const getScopeCategoriesLocal = (groupsList: any[], groupId?: string, deptId?: string, catId?: string) => {
                const g = groupsList.find(gr => String(gr.id) === String(groupId));
                if (!g) return [];
                if (catId) {
                    const targetDept = deptId
                        ? g.departments?.find((d: any) => String(d.id) === String(deptId))
                        : g.departments?.find((d: any) => d.categories?.some((c: any) => String(c.id) === String(catId)));
                    const cat = targetDept?.categories?.find((c: any) => String(c.id) === String(catId));
                    return targetDept && cat ? [cat] : [];
                }
                if (deptId) {
                    const dept = g.departments?.find((d: any) => String(d.id) === String(deptId));
                    if (!dept) return [];
                    return dept.categories || [];
                }
                return g.departments?.flatMap((d: any) => d.categories || []) || [];
            };

            const latestByBranch = new Map<string, SupabaseService.DbAuditSession>();
            dashboardCompletedAuditSessions.forEach(session => {
                if (completedAuditNumberFilter !== 'all' && String(session.audit_number || 0) !== completedAuditNumberFilter) {
                    return;
                }
                const branchLabel = normalizeBranchLabel(session.branch);
                const prev = latestByBranch.get(branchLabel);
                if (!prev) {
                    latestByBranch.set(branchLabel, session);
                    return;
                }
                const prevAudit = Number(prev.audit_number || 0);
                const curAudit = Number(session.audit_number || 0);
                if (curAudit > prevAudit) {
                    latestByBranch.set(branchLabel, session);
                    return;
                }
                if (curAudit < prevAudit) return;
                const prevTs = Date.parse(String(prev.updated_at || prev.created_at || '')) || 0;
                const curTs = Date.parse(String(session.updated_at || session.created_at || '')) || 0;
                if (curTs > prevTs || (curTs === prevTs && Number(session.audit_number || 0) > Number(prev.audit_number || 0))) {
                    latestByBranch.set(branchLabel, session);
                }
            });

            if (latestByBranch.size === 0) {
                alert("Nenhuma auditoria encontrada com os filtros selecionados.");
                return;
            }

            const allProductsData: any[] = [];
            const branchSummaries: any[] = [];
            let globalSysQty = 0;
            let globalCountedQty = 0;
            let globalSysCost = 0;
            let globalCountedCost = 0;
            let globalFaltaQty = 0;
            let globalFaltaCost = 0;
            let globalSobraQty = 0;
            let globalSobraCost = 0;
            let globalDivergentSkusCount = 0;

            latestByBranch.forEach((session, branchLabel) => {
                const parsedData = parseJsonValue<any>(session.data) || session.data || {};
                const groups = Array.isArray(parsedData?.groups) ? parsedData.groups : [];
                const termDrafts = parsedData?.termDrafts || {};

                const coveredCategories = new Set<string>();
                const sessionProducts: any[] = [];

                // 1. Processar rascunhos de termos que têm excelMetrics
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
                });

                // 2. Processar categorias do banco que NÃO foram cobertas por planilhas Excel dos termos
                groups.forEach((g: any) => {
                    g.departments?.forEach((d: any) => {
                        d.categories?.forEach((c: any) => {
                            if (!coveredCategories.has(c.id)) {
                                const isCatDone = c.status === 'concluido' || c.status === 'completed';
                                c.products?.forEach((p: any) => {
                                    const sysQty = Number(p.quantity || 0);
                                    const countedQty = isCatDone ? sysQty : 0;
                                    const cost = Number(p.cost || 0);
                                    const sysCost = sysQty * cost;
                                    const countedCost = countedQty * cost;
                                    const diffQty = countedQty - sysQty;
                                    const diffCost = countedCost - sysCost;

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
                                        code: p.code || '',
                                        reducedCode: p.reducedCode || p.code || '',
                                        name: p.name || '',
                                        groupName: g.name || 'DIVERSOS (SEM GRUPO)',
                                        deptName: d.name || 'DIVERSOS (SEM DEPARTAMENTO)',
                                        catName: c.name || 'DIVERSOS (SEM CATEGORIA)',
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
                            }
                        });
                    });
                });

                // Acumuladores locais da filial baseados na lista real gerada
                let branchSysQty = 0;
                let branchCountedQty = 0;
                let branchSysCost = 0;
                let branchCountedCost = 0;
                let branchFaltaQty = 0;
                let branchFaltaCost = 0;
                let branchSobraQty = 0;
                let branchSobraCost = 0;
                let branchDivergentSkus = 0;

                sessionProducts.forEach(p => {
                    branchSysQty += p.sysQty;
                    branchCountedQty += p.countedQty;
                    branchSysCost += p.sysCost;
                    branchCountedCost += p.countedCost;
                    branchFaltaQty += p.faltaQty;
                    branchFaltaCost += p.faltaCost;
                    branchSobraQty += p.sobraQty;
                    branchSobraCost += p.sobraCost;
                    if (p.diffQty !== 0) {
                        branchDivergentSkus++;
                        globalDivergentSkusCount++;
                    }
                    allProductsData.push(p);
                });

                globalSysQty += branchSysQty;
                globalCountedQty += branchCountedQty;
                globalSysCost += branchSysCost;
                globalCountedCost += branchCountedCost;
                globalFaltaQty += branchFaltaQty;
                globalFaltaCost += branchFaltaCost;
                globalSobraQty += branchSobraQty;
                globalSobraCost += branchSobraCost;

                branchSummaries.push({
                    'Filial / Loja': branchLabel,
                    'Nº Auditoria': session.audit_number || 0,
                    'Total SKUs': sessionProducts.length,
                    'SKUs c/ Divergência': branchDivergentSkus,
                    'Qtd Sistema': branchSysQty,
                    'Qtd Conferida': branchCountedQty,
                    'Divergência Qtd': branchCountedQty - branchSysQty,
                    'Custo Sistema (R$)': branchSysCost,
                    'Custo Conferido (R$)': branchCountedCost,
                    'Divergência Financeira (R$)': branchCountedCost - branchSysCost,
                    'Qtd Faltas (Perdas)': branchFaltaQty,
                    'Valor Faltas (R$)': branchFaltaCost,
                    'Qtd Sobras': branchSobraQty,
                    'Valor Sobras (R$)': branchSobraCost
                });
            });

            if (allProductsData.length === 0) {
                alert("Nenhum item encontrado nos inventários concluídos.");
                return;
            }

            // 3. Agrupamentos
            const groupMap: Record<string, any> = {};
            const deptMap: Record<string, any> = {};
            const catMap: Record<string, any> = {};

            allProductsData.forEach(p => {
                // Grupo
                if (!groupMap[p.groupName]) {
                    groupMap[p.groupName] = { Grupo: p.groupName, 'Qtd Sistema': 0, 'Qtd Conferida': 0, 'Divergência Qtd': 0, 'Custo Sistema (R$)': 0, 'Custo Conferido (R$)': 0, 'Divergência R$': 0, 'Qtd Faltas (Perdas)': 0, 'Valor Faltas (R$)': 0, 'Qtd Sobras': 0, 'Valor Sobras (R$)': 0 };
                }
                const g = groupMap[p.groupName];
                g['Qtd Sistema'] += p.sysQty;
                g['Qtd Conferida'] += p.countedQty;
                g['Divergência Qtd'] += p.diffQty;
                g['Custo Sistema (R$)'] += p.sysCost;
                g['Custo Conferido (R$)'] += p.countedCost;
                g['Divergência R$'] += p.diffCost;
                g['Qtd Faltas (Perdas)'] += p.faltaQty;
                g['Valor Faltas (R$)'] += p.faltaCost;
                g['Qtd Sobras'] += p.sobraQty;
                g['Valor Sobras (R$)'] += p.sobraCost;

                // Departamento
                const deptKey = `${p.groupName} | ${p.deptName}`;
                if (!deptMap[deptKey]) {
                    deptMap[deptKey] = { Grupo: p.groupName, Departamento: p.deptName, 'Qtd Sistema': 0, 'Qtd Conferida': 0, 'Divergência Qtd': 0, 'Custo Sistema (R$)': 0, 'Custo Conferido (R$)': 0, 'Divergência R$': 0, 'Qtd Faltas (Perdas)': 0, 'Valor Faltas (R$)': 0, 'Qtd Sobras': 0, 'Valor Sobras (R$)': 0 };
                }
                const d = deptMap[deptKey];
                d['Qtd Sistema'] += p.sysQty;
                d['Qtd Conferida'] += p.countedQty;
                d['Divergência Qtd'] += p.diffQty;
                d['Custo Sistema (R$)'] += p.sysCost;
                d['Custo Conferido (R$)'] += p.countedCost;
                d['Divergência R$'] += p.diffCost;
                d['Qtd Faltas (Perdas)'] += p.faltaQty;
                d['Valor Faltas (R$)'] += p.faltaCost;
                d['Qtd Sobras'] += p.sobraQty;
                d['Valor Sobras (R$)'] += p.sobraCost;

                // Categoria
                const catKey = `${p.groupName} | ${p.deptName} | ${p.catName}`;
                if (!catMap[catKey]) {
                    catMap[catKey] = { Grupo: p.groupName, Departamento: p.deptName, Categoria: p.catName, 'Qtd Sistema': 0, 'Qtd Conferida': 0, 'Divergência Qtd': 0, 'Custo Sistema (R$)': 0, 'Custo Conferido (R$)': 0, 'Divergência R$': 0, 'Qtd Faltas (Perdas)': 0, 'Valor Faltas (R$)': 0, 'Qtd Sobras': 0, 'Valor Sobras (R$)': 0 };
                }
                const c = catMap[catKey];
                c['Qtd Sistema'] += p.sysQty;
                c['Qtd Conferida'] += p.countedQty;
                c['Divergência Qtd'] += p.diffQty;
                c['Custo Sistema (R$)'] += p.sysCost;
                c['Custo Conferido (R$)'] += p.countedCost;
                c['Divergência R$'] += p.diffCost;
                c['Qtd Faltas (Perdas)'] += p.faltaQty;
                c['Valor Faltas (R$)'] += p.faltaCost;
                c['Qtd Sobras'] += p.sobraQty;
                c['Valor Sobras (R$)'] += p.sobraCost;
            });

            // 4. Criar workbook
            const wb = XLSX.utils.book_new();

            // Aba 1: Resumo Consolidado Geral
            const overallDiffCost = globalCountedCost - globalSysCost;
            const deviationPercent = globalSysCost > 0 ? (overallDiffCost / globalSysCost) * 100 : 0;
            
            const summaryTitleData = [
                ['MÉTRICA REDE / CONSOLIDADA', 'VALOR'],
                ['TOTAL DE FILIAIS ANALISADAS', latestByBranch.size],
                ['NÚMERO DA AUDITORIA FILTRADO', completedAuditNumberFilter === 'all' ? 'TODAS AS AUDITORIAS' : `AUDITORIA ${completedAuditNumberFilter}`],
                ['DATA DE EXPORTAÇÃO', new Date().toLocaleString('pt-BR')],
                ['TOTAL DE SKUS CONSOLIDADO', allProductsData.length],
                ['TOTAL DE SKUS COM DIVERGÊNCIA', globalDivergentSkusCount],
                ['QUANTIDADE TOTAL SISTEMA', globalSysQty],
                ['QUANTIDADE TOTAL CONFERIDA', globalCountedQty],
                ['DIVERGÊNCIA LÍQUIDA QTD', globalCountedQty - globalSysQty],
                ['VALOR TOTAL SISTEMA (CUSTO)', globalSysCost],
                ['VALOR TOTAL CONFERIDO (CUSTO)', globalCountedCost],
                ['DIVERGÊNCIA LÍQUIDA FINANCEIRA (R$)', overallDiffCost],
                ['REPRESENTAÇÃO DIVERGÊNCIA CONSOLIDADA (%)', deviationPercent],
                ['FALTAS / PERDAS REDE - QTD UNIDADES', globalFaltaQty],
                ['FALTAS / PERDAS REDE - VALOR (R$)', globalFaltaCost],
                ['SOBRAS REDE - QTD UNIDADES', globalSobraQty],
                ['SOBRAS REDE - VALOR (R$)', globalSobraCost],
                [],
                ['RESUMO FINANCEIRO POR FILIAL / LOJA']
            ];
            
            const wsSummary = XLSX.utils.aoa_to_sheet(summaryTitleData);
            XLSX.utils.sheet_add_json(wsSummary, branchSummaries, { origin: 'A20' });
            XLSX.utils.book_append_sheet(wb, wsSummary, "Resumo Consolidado");

            // Aba 2: Por Grupo
            const wsGroup = XLSX.utils.json_to_sheet(Object.values(groupMap));
            XLSX.utils.book_append_sheet(wb, wsGroup, "Consolidado por Grupo");

            // Aba 3: Por Departamento
            const wsDept = XLSX.utils.json_to_sheet(Object.values(deptMap));
            XLSX.utils.book_append_sheet(wb, wsDept, "Consolidado por Depto");

            // Aba 4: Por Categoria
            const wsCat = XLSX.utils.json_to_sheet(Object.values(catMap));
            XLSX.utils.book_append_sheet(wb, wsCat, "Consolidado por Categoria");

            // Aba 5: Itens Detalhado
            const detailedItems = allProductsData.map(p => ({
                'Filial / Loja': p.branch,
                'Nº Auditoria': p.auditNumber,
                'Código de Barras': p.code,
                'Código Reduzido': p.reducedCode,
                'Descrição do Produto': p.name,
                'Grupo': p.groupName,
                'Departamento': p.deptName,
                'Categoria': p.catName,
                'Custo Unitário (R$)': p.cost,
                'Qtd Sistema': p.sysQty,
                'Qtd Físico': p.countedQty,
                'Divergência Qtd': p.diffQty,
                'Total Sistema (R$)': p.sysCost,
                'Total Físico (R$)': p.countedCost,
                'Divergência Financeira (R$)': p.diffCost,
                'Qtd Faltas (Perdas)': p.faltaQty,
                'Valor Faltas (R$)': p.faltaCost,
                'Qtd Sobras': p.sobraQty,
                'Valor Sobras (R$)': p.sobraCost,
                'Status': p.status
            }));
            const wsDetailed = XLSX.utils.json_to_sheet(detailedItems);
            XLSX.utils.book_append_sheet(wb, wsDetailed, "Itens Detalhado (Multiloja)");

            const filterName = completedAuditNumberFilter === 'all' ? 'TODAS' : `N${completedAuditNumberFilter}`;
            const fileName = `Auditoria_Consolidada_Rede_${filterName}_Detalhado.xlsx`;
            XLSX.writeFile(wb, fileName);

            SupabaseService.insertAppEventLog({
                company_id: selectedCompany?.id || null,
                branch: null,
                area: null,
                user_email: currentUser?.email || 'sistema',
                user_name: currentUser?.name || null,
                app: 'auditoria',
                event_type: 'audit_report_printed',
                entity_type: 'audit_report',
                entity_id: fileName,
                status: 'success',
                success: true,
                source: 'web'
            }).catch(() => { });

        } catch (error) {
            console.error("Erro ao exportar planilha Excel consolidada:", error);
            alert("Erro ao gerar o relatório detalhado consolidado em Excel.");
        }
    };"""

app_replacement = app_content.replace(match.group(0), new_app_func + "\n    const handleViewChange")
with open(app_path, "w", encoding="utf-8") as f:
    f.write(app_replacement)
print("App.tsx atualizado com sucesso!")


# 2. Atualizar AuditModule.tsx
with open(audit_path, "r", encoding="utf-8") as f:
    audit_content = f.read()

# Achar a definição de handleExportDetailedExcel no AuditModule.tsx
audit_func_pattern = r"(const handleExportDetailedExcel = \(\) => \{)([\s\S]*?)(};[\s\n]*const selectedGroup = useMemo)"
match_audit = re.search(audit_func_pattern, audit_content)

new_audit_func = """const handleExportDetailedExcel = () => {
        if (!data) {
            alert("Nenhum dado de auditoria disponível para exportação.");
            return;
        }

        try {
            const getScopeCategoriesLocal = (groupId?: string, deptId?: string, catId?: string) => {
                const g = data.groups.find(gr => String(gr.id) === String(groupId));
                if (!g) return [];
                if (catId) {
                    const targetDept = deptId
                        ? g.departments?.find((d: any) => String(d.id) === String(deptId))
                        : g.departments?.find((d: any) => d.categories?.some((c: any) => String(c.id) === String(catId)));
                    const cat = targetDept?.categories?.find((c: any) => String(c.id) === String(catId));
                    return targetDept && cat ? [cat] : [];
                }
                if (deptId) {
                    const dept = g.departments?.find((d: any) => String(d.id) === String(deptId));
                    if (!dept) return [];
                    return dept.categories || [];
                }
                return g.departments?.flatMap((d: any) => d.categories || []) || [];
            };

            const allProductsData: any[] = [];
            let totalSysQty = 0;
            let totalCountedQty = 0;
            let totalSysCost = 0;
            let totalCountedCost = 0;
            let totalFaltaQty = 0;
            let totalFaltaCost = 0;
            let totalSobraQty = 0;
            let totalSobraCost = 0;
            let divergentSkusCount = 0;

            const coveredCategories = new Set<string>();

            // 1. Processar rascunhos de termos que têm excelMetrics
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
            });

            // 2. Processar categorias do banco que NÃO foram cobertas por planilhas Excel dos termos
            data.groups.forEach(g => {
                g.departments?.forEach(d => {
                    d.categories?.forEach(c => {
                        if (!coveredCategories.has(c.id)) {
                            const isCatDone = isDoneStatus(c.status);
                            c.products?.forEach(p => {
                                const sysQty = Number(p.quantity || 0);
                                const countedQty = isCatDone ? sysQty : 0;
                                const cost = Number(p.cost || 0);
                                const sysCost = sysQty * cost;
                                const countedCost = countedQty * cost;
                                const diffQty = countedQty - sysQty;
                                const diffCost = countedCost - sysCost;

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
                                    code: p.code || '',
                                    reducedCode: p.reducedCode || p.code || '',
                                    name: p.name || '',
                                    groupName: g.name || 'DIVERSOS (SEM GRUPO)',
                                    deptName: d.name || 'DIVERSOS (SEM DEPARTAMENTO)',
                                    catName: c.name || 'DIVERSOS (SEM CATEGORIA)',
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
                        }
                    });
                });
            });

            // Acumular totais a partir de allProductsData
            allProductsData.forEach(p => {
                totalSysQty += p.sysQty;
                totalCountedQty += p.countedQty;
                totalSysCost += p.sysCost;
                totalCountedCost += p.countedCost;
                totalFaltaQty += p.faltaQty;
                totalFaltaCost += p.faltaCost;
                totalSobraQty += p.sobraQty;
                totalSobraCost += p.sobraCost;
                if (p.diffQty !== 0) {
                    divergentSkusCount++;
                }
            });

            // 3. Agrupamentos
            const groupMap: Record<string, any> = {};
            const deptMap: Record<string, any> = {};
            const catMap: Record<string, any> = {};

            allProductsData.forEach(p => {
                // Grupo
                if (!groupMap[p.groupName]) {
                    groupMap[p.groupName] = { Grupo: p.groupName, 'Qtd Sistema': 0, 'Qtd Conferida': 0, 'Divergência Qtd': 0, 'Custo Sistema (R$)': 0, 'Custo Conferido (R$)': 0, 'Divergência R$': 0, 'Qtd Faltas (Perdas)': 0, 'Valor Faltas (R$)': 0, 'Qtd Sobras': 0, 'Valor Sobras (R$)': 0 };
                }
                const g = groupMap[p.groupName];
                g['Qtd Sistema'] += p.sysQty;
                g['Qtd Conferida'] += p.countedQty;
                g['Divergência Qtd'] += p.diffQty;
                g['Custo Sistema (R$)'] += p.sysCost;
                g['Custo Conferido (R$)'] += p.countedCost;
                g['Divergência R$'] += p.diffCost;
                g['Qtd Faltas (Perdas)'] += p.faltaQty;
                g['Valor Faltas (R$)'] += p.faltaCost;
                g['Qtd Sobras'] += p.sobraQty;
                g['Valor Sobras (R$)'] += p.sobraCost;

                // Departamento
                const deptKey = `${p.groupName} | ${p.deptName}`;
                if (!deptMap[deptKey]) {
                    deptMap[deptKey] = { Grupo: p.groupName, Departamento: p.deptName, 'Qtd Sistema': 0, 'Qtd Conferida': 0, 'Divergência Qtd': 0, 'Custo Sistema (R$)': 0, 'Custo Conferido (R$)': 0, 'Divergência R$': 0, 'Qtd Faltas (Perdas)': 0, 'Valor Faltas (R$)': 0, 'Qtd Sobras': 0, 'Valor Sobras (R$)': 0 };
                }
                const d = deptMap[deptKey];
                d['Qtd Sistema'] += p.sysQty;
                d['Qtd Conferida'] += p.countedQty;
                d['Divergência Qtd'] += p.diffQty;
                d['Custo Sistema (R$)'] += p.sysCost;
                d['Custo Conferido (R$)'] += p.countedCost;
                d['Divergência R$'] += p.diffCost;
                d['Qtd Faltas (Perdas)'] += p.faltaQty;
                d['Valor Faltas (R$)'] += p.faltaCost;
                d['Qtd Sobras'] += p.sobraQty;
                d['Valor Sobras (R$)'] += p.sobraCost;

                // Categoria
                const catKey = `${p.groupName} | ${p.deptName} | ${p.catName}`;
                if (!catMap[catKey]) {
                    catMap[catKey] = { Grupo: p.groupName, Departamento: p.deptName, Categoria: p.catName, 'Qtd Sistema': 0, 'Qtd Conferida': 0, 'Divergência Qtd': 0, 'Custo Sistema (R$)': 0, 'Custo Conferido (R$)': 0, 'Divergência R$': 0, 'Qtd Faltas (Perdas)': 0, 'Valor Faltas (R$)': 0, 'Qtd Sobras': 0, 'Valor Sobras (R$)': 0 };
                }
                const c = catMap[catKey];
                c['Qtd Sistema'] += p.sysQty;
                c['Qtd Conferida'] += p.countedQty;
                c['Divergência Qtd'] += p.diffQty;
                c['Custo Sistema (R$)'] += p.sysCost;
                c['Custo Conferido (R$)'] += p.countedCost;
                c['Divergência R$'] += p.diffCost;
                c['Qtd Faltas (Perdas)'] += p.faltaQty;
                c['Valor Faltas (R$)'] += p.faltaCost;
                c['Qtd Sobras'] += p.sobraQty;
                c['Valor Sobras (R$)'] += p.sobraCost;
            });

            // 4. Criar workbook
            const wb = XLSX.utils.book_new();

            // Aba 1: Resumo Geral
            const overallDiffCost = totalCountedCost - totalSysCost;
            const deviationPercent = totalSysCost > 0 ? (overallDiffCost / totalSysCost) * 100 : 0;
            const summaryData = [
                ['MÉTRICA', 'VALOR'],
                ['EMPRESA', data.empresa || 'Sem Empresa'],
                ['FILIAL / LOJA', data.filial || 'Sem Filial'],
                ['NÚMERO DA AUDITORIA', accessedAuditNumber !== null ? String(accessedAuditNumber) : 'N/A'],
                ['STATUS DA SESSÃO', isReadOnlyCompletedView ? 'CONCLUÍDO (MODO CONSULTA)' : 'ABERTO'],
                ['DATA DE EXPORTAÇÃO', new Date().toLocaleString('pt-BR')],
                ['TOTAL SKUS CADASTRADOS', allProductsData.length],
                ['TOTAL DE SKUS COM DIVERGÊNCIA', divergentSkusCount],
                ['QUANTIDADE TOTAL SISTEMA', totalSysQty],
                ['QUANTIDADE TOTAL CONFERIDA', totalCountedQty],
                ['DIVERGÊNCIA LÍQUIDA QTD', totalCountedQty - totalSysQty],
                ['VALOR TOTAL SISTEMA (CUSTO)', totalSysCost],
                ['VALOR TOTAL CONFERIDO (CUSTO)', totalCountedCost],
                ['DIVERGÊNCIA LÍQUIDA FINANCEIRA (R$)', overallDiffCost],
                ['REPRESENTAÇÃO DIVERGÊNCIA (%)', deviationPercent],
                ['FALTAS / PERDAS - QTD UNIDADES', totalFaltaQty],
                ['FALTAS / PERDAS - VALOR (R$)', totalFaltaCost],
                ['SOBRAS - QTD UNIDADES', totalSobraQty],
                ['SOBRAS - VALOR (R$)', totalSobraCost]
            ];
            const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
            XLSX.utils.book_append_sheet(wb, wsSummary, "Resumo Geral");

            // Aba 2: Por Grupo
            const wsGroup = XLSX.utils.json_to_sheet(Object.values(groupMap));
            XLSX.utils.book_append_sheet(wb, wsGroup, "Por Grupo");

            // Aba 3: Por Departamento
            const wsDept = XLSX.utils.json_to_sheet(Object.values(deptMap));
            XLSX.utils.book_append_sheet(wb, wsDept, "Por Departamento");

            // Aba 4: Por Categoria
            const wsCat = XLSX.utils.json_to_sheet(Object.values(catMap));
            XLSX.utils.book_append_sheet(wb, wsCat, "Por Categoria");

            // Aba 5: Itens Detalhado
            const detailedItems = allProductsData.map(p => ({
                'Código de Barras': p.code,
                'Código Reduzido': p.reducedCode,
                'Descrição do Produto': p.name,
                'Grupo': p.groupName,
                'Departamento': p.deptName,
                'Categoria': p.catName,
                'Custo Unitário (R$)': p.cost,
                'Qtd Sistema': p.sysQty,
                'Qtd Físico': p.countedQty,
                'Divergência Qtd': p.diffQty,
                'Total Sistema (R$)': p.sysCost,
                'Total Físico (R$)': p.countedCost,
                'Divergência Financeira (R$)': p.diffCost,
                'Qtd Faltas (Perdas)': p.faltaQty,
                'Valor Faltas (R$)': p.faltaCost,
                'Qtd Sobras': p.sobraQty,
                'Valor Sobras (R$)': p.sobraCost,
                'Status': p.status
            }));
            const wsDetailed = XLSX.utils.json_to_sheet(detailedItems);
            XLSX.utils.book_append_sheet(wb, wsDetailed, "Itens Detalhado");

            const fileName = `Auditoria_F${data.filial}_N${accessedAuditNumber || 'DETALHADA'}_Detalhado.xlsx`;
            XLSX.writeFile(wb, fileName);

            insertAppEventLog({
                company_id: selectedCompany?.id || null,
                branch: selectedFilial || null,
                area: null,
                user_email: userEmail,
                user_name: userName || null,
                app: 'auditoria',
                event_type: 'audit_report_printed',
                entity_type: 'audit_report',
                entity_id: fileName,
                status: 'success',
                success: true,
                source: 'web'
            }).catch(() => { });

        } catch (error) {
            console.error("Erro ao exportar planilha Excel detalhada:", error);
            alert("Erro ao gerar o relatório detalhado em Excel.");
        }
    };"""

audit_replacement = audit_content.replace(match_audit.group(0), new_audit_func + "\n    const selectedGroup = useMemo")
with open(audit_path, "w", encoding="utf-8") as f:
    f.write(audit_replacement)
print("AuditModule.tsx atualizado com sucesso!")
