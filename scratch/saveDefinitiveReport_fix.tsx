  const saveDefinitiveReport = async (): Promise<boolean> => {
    if (lastSavedReportId) return true; // Já salvo corretamente
    if (isSavingStockReport) return false;

    setIsSavingStockReport(true);
    let reportSaved = false;

    // Define all variables outside try so catch can use them
    const allItems = Array.from(inventory.values());
    const matched = allItems.filter(item => item.status === 'matched').length;
    const divergent = allItems.filter(item => item.status === 'divergent').length;
    const pending = allItems.filter(item => item.status === 'pending').length;
    const finalizedAt = new Date();
    const startTimestamp = sessionStartTime ? new Date(sessionStartTime).toISOString() : null;
    const endTimestamp = finalizedAt.toISOString();
    const durationMs = sessionStartTime ? Math.max(0, finalizedAt.getTime() - sessionStartTime) : 0;

    const summary = {
      total: allItems.length,
      matched,
      divergent,
      pending,
      percent: stats.percent,
      duration_ms: durationMs,
      durationMs,
      started_at: startTimestamp,
      startedAt: startTimestamp,
      ended_at: endTimestamp,
      endedAt: endTimestamp,
      signatures: {
        pharmacist: pharmSignature,
        manager: managerSignature
      }
    };

    const inventorySnapshot = allItems.map(item => {
      const product = masterProducts.get(item.reducedCode);
      return {
        reduced_code: item.reducedCode,
        barcode: product?.barcode || null,
        description: product?.description || null,
        system_qty: item.systemQty,
        counted_qty: item.countedQty,
        status: item.status,
        difference: item.countedQty - item.systemQty,
        last_updated: item.lastUpdated ? item.lastUpdated.toISOString() : null
      };
    });

    const payload = {
      user_email: userEmail?.trim() || 'desconhecido@empresa.com',
      user_name: userName?.trim() || 'Operador',
      branch: branch || 'Filial não informada',
      area: selectedAreaName || 'Área não informada',
      pharmacist: pharmacist || 'Farmacêutico não informado',
      manager: manager || 'Gestor não informado',
      summary,
      items: inventorySnapshot
    };

    try {
      const isOnlineNow = typeof navigator !== 'undefined' && navigator.onLine;

      if (!isOnlineNow) {
        stockDebugLog('📡 Offline mode: Saving report to Pending Queue');
        const pendingId = await StockStorage.savePendingStockReport(payload);
        setLastSavedReportId(pendingId);
        setLastSavedSummary(summary);
        reportSaved = true;

        alert('⚠️ RELATÓRIO SALVO LOCALMENTE\n\nIdentificamos que você está sem internet. Sua conferência foi salva no computador e será enviada automaticamente para o banco de dados assim que a conexão voltar.');
        
        if (onReportSaved) {
          await onReportSaved();
        }

        await StockStorage.clearLocalStockSession(userEmail || '');
        return true;
      }

      const saved = await SupabaseService.createStockConferenceReport(payload);
      if (!saved) {
        throw new Error('Falha ao salvar no servidor (Status 530/502/Timeout)');
      }

      reportSaved = true;
      setLastSavedReportId(saved.id || null);
      setLastSavedSummary(summary);

      if (onReportSaved) {
        await onReportSaved();
      }

      if (userEmail) {
        SupabaseService.insertAppEventLog({
          company_id: selectedCompanyId || null,
          branch: branch || null,
          area: selectedAreaName || null,
          user_email: userEmail,
          user_name: userName || null,
          app: 'conferencia',
          event_type: 'stock_conference_finished',
          entity_type: 'stock_report',
          entity_id: saved.id || null,
          status: 'success',
          success: true,
          source: 'web',
          event_meta: { total: summary.total, matched: summary.matched, divergent: summary.divergent }
        }).catch(() => { });

        await StockStorage.clearLocalStockSession(userEmail);
        try {
          await SupabaseService.deleteStockConferenceSession(userEmail);
        } catch (deleteError) { }
      }
    } catch (error) {
      console.error('Erro ao salvar conferência de estoque definitivo:', error);
      
      // Fallback para salvamento local em caso de erro de rede (502, 530, timeout)
      stockDebugLog('⚠️ Network error during finalization, falling back to local storage');
      
      const pendingId = await StockStorage.savePendingStockReport(payload);
      setLastSavedReportId(pendingId);
      setLastSavedSummary(summary);
      reportSaved = true;
      
      alert('⚠️ RELATÓRIO SALVO COM SUCESSO (LOCAL)\n\nHouve uma falha na comunicação com o servidor, mas não se preocupe: seus dados foram salvos com segurança neste computador. O envio para o banco de dados será concluído automaticamente em instantes.');
      
      if (onReportSaved) {
        await onReportSaved();
      }

      if (userEmail) {
        await StockStorage.clearLocalStockSession(userEmail);
      }
    } finally {
      setIsSavingStockReport(false);
      if (reportSaved) {
        setIsDirty(false);
        manualSessionStartedRef.current = false;
        setSessionId(null);
      }
    }
    return reportSaved;
  };
