import sys
import re

filepath = 'components/auditoria/AuditModule.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

new_handle_signature = """    const handleSignatureComplete = async (field: 'managerSignature' | 'managerSignature2' | { collabIndex: number }, dataUrl: string) => {
        if (isReadOnlyCompletedView || !termModal || !data) return;

        // Atualização instantânea para a UI
        updateTermForm(prev => {
            if (!prev) return prev;
            const updated = { ...prev };
            if (field === 'managerSignature') updated.managerSignature = dataUrl;
            else if (field === 'managerSignature2') updated.managerSignature2 = dataUrl;
            else if (typeof field === 'object' && field.collabIndex !== undefined) {
                updated.collaborators = updated.collaborators.map((c, i) => i === field.collabIndex ? { ...c, signature: dataUrl } : c);
            }
            return updated;
        });

        // Background: compressão, replicação para todos os termos e salvamento no BD
        void (async () => {
            try {
                const compressed = await ImageUtils.compressImage(dataUrl, { maxWidth: 600, quality: 0.6 });
                
                const currentData = data;
                const currentForm = termFormRef.current || termForm;

                let finalForm = { ...currentForm } as TermForm;
                if (field === 'managerSignature') finalForm.managerSignature = compressed;
                else if (field === 'managerSignature2') finalForm.managerSignature2 = compressed;
                else if (typeof field === 'object' && field.collabIndex !== undefined) {
                    finalForm.collaborators = finalForm.collaborators.map((c, i) => i === field.collabIndex ? { ...c, signature: compressed } : c);
                }

                // Atualiza a UI com a versão comprimida
                updateTermForm(() => finalForm);

                // IMPORTANTE: Buscar a auditoria MAIS RECENTE do banco para não sobrescrever o progresso de outros usuários (ex: Gestor vs Master)
                const freshLatest = await fetchLatestAudit(selectedFilial);
                const baseData = freshLatest ? (freshLatest.data as AuditData) : currentData;
                const baseDrafts = (baseData as any).termDrafts || {};

                // Monta estrutura de salvamento baseada nos dados mais recentes
                const key = buildTermKey(termModal);
                const forceClearedFlag = removedExcelDraftKeysRef.current.has(key);
                const latestDraftAtKey = baseDrafts[key] || termDrafts[key];
                const hasAnyMetricsInMemory = !!(rawTermMetricsRef.current || rawTermComparisonMetrics || termComparisonMetrics || finalForm.excelMetrics || latestDraftAtKey?.excelMetrics);
                const forceCleared = forceClearedFlag && !hasAnyMetricsInMemory;
                const persistedMetrics = forceCleared ? undefined : (rawTermMetricsRef.current || rawTermComparisonMetrics || termComparisonMetrics || finalForm.excelMetrics || latestDraftAtKey?.excelMetrics);
                
                const formToSave = persistedMetrics ? { ...finalForm, excelMetrics: persistedMetrics } : (latestDraftAtKey || finalForm);
                const nextDrafts = forceCleared ? baseDrafts : upsertScopeDraft(baseDrafts, termModal, formToSave);
                
                // Replica assinatura para TODOS os termos em rascunho instantaneamente
                const syncedDrafts = replicateSignersToAllTermDrafts(nextDrafts, finalForm);
                const nextDataWithTerms = { ...baseData, termDrafts: syncedDrafts } as any;
                
                setTermDrafts(syncedDrafts);
                setData(nextDataWithTerms as AuditData);

                // Dispara salvamento pro DB passando allowProgressRegression para contornar qualquer rejeição de timestamp
                let skus = 0;
                let doneSkus = 0;
                (nextDataWithTerms.groups || []).forEach((g: any) =>
                    (g.departments || []).forEach((d: any) =>
                        (d.categories || []).forEach((c: any) => {
                            skus += Number(c.itemsCount || 0);
                            if (isDoneStatus(c.status)) doneSkus += Number(c.itemsCount || 0);
                        })
                    )
                );
                const progress = skus > 0 ? (doneSkus / skus) * 100 : 0;
                
                const savedSession = await persistAuditSession({
                    id: freshLatest?.id || dbSessionId,
                    branch: selectedFilial,
                    audit_number: freshLatest?.audit_number || nextAuditNumber,
                    status: freshLatest?.status || 'open',
                    data: nextDataWithTerms,
                    progress: Math.max(progress, Number(freshLatest?.progress || 0)),
                    user_email: userEmail
                }, { allowProgressRegression: true });
                
                if (savedSession) {
                    await CacheService.set(`audit_session_${selectedFilial}`, savedSession as any);
                }
            } catch (err) {
                console.error("Auto-save signature failed:", err);
            }
        })();
    };"""

pattern = r'    const handleSignatureComplete = async \(.*?\}\)\(\);\s*\};\s*(?=\s*const closeTermModal)'
content = re.sub(pattern, new_handle_signature, content, flags=re.DOTALL)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print("Done patching handleSignatureComplete")
