import sys

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
                const currentDrafts = termDraftsRef.current || termDrafts;
                const currentForm = termFormRef.current || termForm;

                let finalForm = { ...currentForm } as TermForm;
                if (field === 'managerSignature') finalForm.managerSignature = compressed;
                else if (field === 'managerSignature2') finalForm.managerSignature2 = compressed;
                else if (typeof field === 'object' && field.collabIndex !== undefined) {
                    finalForm.collaborators = finalForm.collaborators.map((c, i) => i === field.collabIndex ? { ...c, signature: compressed } : c);
                }

                // Atualiza a UI com a versão comprimida
                updateTermForm(() => finalForm);

                // Monta estrutura de salvamento
                const key = buildTermKey(termModal);
                const forceClearedFlag = removedExcelDraftKeysRef.current.has(key);
                const latestDraftAtKey = currentDrafts[key];
                const hasAnyMetricsInMemory = !!(rawTermMetricsRef.current || rawTermComparisonMetrics || termComparisonMetrics || finalForm.excelMetrics || latestDraftAtKey?.excelMetrics);
                const forceCleared = forceClearedFlag && !hasAnyMetricsInMemory;
                const persistedMetrics = forceCleared ? undefined : (rawTermMetricsRef.current || rawTermComparisonMetrics || termComparisonMetrics || finalForm.excelMetrics || latestDraftAtKey?.excelMetrics);
                
                const formToSave = persistedMetrics ? { ...finalForm, excelMetrics: persistedMetrics } : (latestDraftAtKey || finalForm);
                const nextDrafts = forceCleared ? currentDrafts : upsertScopeDraft(currentDrafts, termModal, formToSave);
                
                // Replica assinatura para TODOS os termos em rascunho instantaneamente
                const syncedDrafts = replicateSignersToAllTermDrafts(nextDrafts, finalForm);
                const nextDataWithTerms = { ...currentData, termDrafts: syncedDrafts } as any;
                
                setTermDrafts(syncedDrafts);
                setData(nextDataWithTerms as AuditData);

                // Dispara salvamento pro DB
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
                    id: dbSessionId,
                    branch: selectedFilial,
                    audit_number: nextAuditNumber,
                    status: 'open',
                    data: nextDataWithTerms,
                    progress: progress,
                    user_email: userEmail
                });
                if (savedSession) {
                    await CacheService.set(`audit_session_${selectedFilial}`, savedSession as any);
                }
            } catch (err) {
                console.error("Auto-save signature failed:", err);
            }
        })();
    };

    const closeTermModal ="""

if "    const closeTermModal =" in content:
    content = content.replace("    const closeTermModal =", new_handle_signature)
else:
    print("closeTermModal not found")
    sys.exit(1)

import re

# managerSignature2
pattern1 = r'<SignaturePad\s+onEnd=\{\(dataUrl\) => \{[\s\S]*?updateTermForm\(prev => \([\s\S]*?prev\.managerSignature2 === dataUrl[\s\S]*?\?\s*\{\s*\.\.\.prev,\s*managerSignature2:\s*compressed\s*\}[\s\S]*?:\s*prev[\s\S]*?\)\);[\s\S]*?\} catch \{[\s\S]*?\}[\s\S]*?\}\)\(\);[\s\S]*?\}\}\s*/>'
replacement1 = '<SignaturePad onEnd={(dataUrl) => handleSignatureComplete(\'managerSignature2\', dataUrl)} />'
content = re.sub(pattern1, replacement1, content)

# managerSignature
pattern2 = r'<SignaturePad\s+onEnd=\{\(dataUrl\) => \{[\s\S]*?updateTermForm\(prev => \([\s\S]*?prev\.managerSignature === dataUrl[\s\S]*?\?\s*\{\s*\.\.\.prev,\s*managerSignature:\s*compressed\s*\}[\s\S]*?:\s*prev[\s\S]*?\)\);[\s\S]*?\} catch \{[\s\S]*?\}[\s\S]*?\}\)\(\);[\s\S]*?\}\}\s*/>'
replacement2 = '<SignaturePad onEnd={(dataUrl) => handleSignatureComplete(\'managerSignature\', dataUrl)} />'
content = re.sub(pattern2, replacement2, content)

# collab
pattern3 = r'<SignaturePad\s+label=\{`Assinatura \$\{collabNumber\}`\}\s+onEnd=\{\(dataUrl\) => \{[\s\S]*?updateTermForm\(prev => \(\{[\s\S]*?\.\.\.prev,[\s\S]*?collaborators: prev\.collaborators\.map\(\(c, i\) => i === idx \? \{ \.\.\.c, signature: dataUrl \} : c\)[\s\S]*?\}\)\);[\s\S]*?updateTermForm\(prev => \(\{[\s\S]*?\.\.\.prev,[\s\S]*?collaborators: prev\.collaborators\.map\(\(c, i\) => \{[\s\S]*?if \(i === idx\) \{[\s\S]*?return c\.signature === dataUrl \? \{ \.\.\.c, signature: compressed \} : c;[\s\S]*?\}[\s\S]*?return c;[\s\S]*?\}\)[\s\S]*?\}\)\);[\s\S]*?\} catch \{[\s\S]*?\}[\s\S]*?\}\)\(\);[\s\S]*?\}\}\s*/>'
replacement3 = '<SignaturePad label={`Assinatura ${collabNumber}`} onEnd={(dataUrl) => handleSignatureComplete({ collabIndex: idx }, dataUrl)} />'
content = re.sub(pattern3, replacement3, content)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print("Done patching signature pad logic")
