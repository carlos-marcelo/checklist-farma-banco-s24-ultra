
import { User, Shield, FileText, Check, FlaskConical, FileCode, ArrowRight, Settings, Info, Building2, MapPin, Sparkles } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { SessionInfo } from '../../preVencidos/types';
import { DbPVInventoryReport, DbPVSalesUpload } from '../../supabaseService';

interface SetupViewProps {
  onComplete: (info: SessionInfo) => void;
  onSystemProductsUpload: (file: File) => void;
  onDCBBaseUpload: (file: File) => void;
  productsLoaded: boolean;
  systemLoaded: boolean;
  dcbLoaded: boolean;
  reportsReady: boolean;
  reportsStatus?: 'idle' | 'loading' | 'ready' | 'missing' | 'error';
  isBranchPrefetching?: boolean;
  branchPrefetchReady?: boolean;
  branchPrefetchError?: string | null;
  onInfoChange?: (info: SessionInfo) => void;
  initialInfo?: SessionInfo | null;
  userBranch?: string | null;
  companies: {
    id: string;
    name: string;
    areas?: { name: string; branches: string[] }[];
  }[];
  uploadHistory?: DbPVSalesUpload[];
  inventoryReport?: DbPVInventoryReport | null;
  systemReportSyncedAt?: string | null;
  dcbReportSyncedAt?: string | null;
}

const SetupView: React.FC<SetupViewProps> = ({
  onComplete,
  onSystemProductsUpload,
  onDCBBaseUpload,
  productsLoaded,
  systemLoaded,
  dcbLoaded,
  reportsReady,
  reportsStatus = 'idle',
  isBranchPrefetching = false,
  branchPrefetchReady = false,
  branchPrefetchError,
  onInfoChange,
  initialInfo,
  userBranch,
  companies,
  uploadHistory,
  inventoryReport,
  systemReportSyncedAt,
  dcbReportSyncedAt
}) => {
  const [info, setInfo] = useState<SessionInfo>({
    company: '',
    filial: '',
    area: '',
    pharmacist: '',
    manager: '',
    companyId: undefined
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!initialInfo) return;
    setInfo({
      company: initialInfo.company || '',
      filial: initialInfo.filial || '',
      area: initialInfo.area || '',
      pharmacist: initialInfo.pharmacist || '',
      manager: initialInfo.manager || '',
      companyId: initialInfo.companyId
    });
  }, [
    initialInfo?.companyId,
    initialInfo?.company,
    initialInfo?.filial,
    initialInfo?.area,
    initialInfo?.pharmacist,
    initialInfo?.manager
  ]);

  const selectedCompany = companies.find(company => company.id === info.companyId);
  const branchOptions = useMemo(() => {
    if (!selectedCompany || !selectedCompany.areas) return [];
    return selectedCompany.areas.flatMap(area => {
      if (!area || !Array.isArray(area.branches)) return [];
      return area.branches.map(branch => ({
        branchName: branch,
        areaName: area.name
      }));
    });
  }, [selectedCompany]);

  const emitInfoChange = (nextInfo: SessionInfo) => {
    if (onInfoChange) onInfoChange(nextInfo);
  };

  const handleCompanyChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = companies.find(company => company.id === event.target.value);
    const nextInfo = {
      ...info,
      companyId: event.target.value as string,
      company: selected?.name || '',
      filial: '',
      area: ''
    };
    setInfo(nextInfo);
    emitInfoChange(nextInfo);
  };

  const handleBranchChange = (event: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    const branchValue = event.target.value;
    const found = branchOptions.find(option => option.branchName === branchValue);
    const nextInfo = {
      ...info,
      filial: branchValue,
      area: found?.areaName || info.area
    };
    setInfo(nextInfo);
    emitInfoChange(nextInfo);
    if (userBranch && branchValue && branchValue !== userBranch) {
      alert(`Atenção: você está entrando na filial ${branchValue}, diferente da filial cadastrada (${userBranch}).`);
    }
  };

  const isFormValid = !!info.companyId && info.filial && info.pharmacist && info.manager && systemLoaded && dcbLoaded;
  const inventoryLoaded = !!(
    info.companyId &&
    info.filial &&
    inventoryReport &&
    String(inventoryReport.branch || '').trim() === String(info.filial || '').trim() &&
    String(inventoryReport.company_id || '').trim() === String(info.companyId || '').trim() &&
    Array.isArray(inventoryReport.records) &&
    inventoryReport.records.length > 0
  );
  const isReportsSyncing = reportsStatus === 'idle' || reportsStatus === 'loading';
  const canStart = isFormValid && reportsReady && !isReportsSyncing && !isBranchPrefetching && !branchPrefetchError;

  const RequirementItem = ({ label, met }: { label: string, met: boolean }) => (
    <div className={`flex items-center gap-2 text-xs font-bold transition-all duration-300 ${met ? 'text-emerald-600' : 'text-slate-400'}`}>
      <div className={`w-5 h-5 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${met ? 'bg-emerald-100 border-emerald-500 shadow-sm shadow-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
        {met && <Check size={10} className="text-emerald-600" />}
      </div>
      {label}
    </div>
  );

  const formatSupabaseDate = (value?: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('pt-BR');
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header Premium */}
      <div className="bg-gradient-to-br from-prevencidos-50 via-white to-amber-50/30 p-8 rounded-3xl shadow-lg border border-prevencidos-100 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-prevencidos-200/20 to-transparent rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-amber-200/10 to-transparent rounded-full blur-2xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-prevencidos-500 to-prevencidos-700 flex items-center justify-center shadow-lg shadow-prevencidos-300/50">
                <Settings size={20} className="text-white" />
              </div>
              <h2 className="text-2xl font-bold bg-gradient-to-r from-prevencidos-600 to-prevencidos-800 bg-clip-text text-transparent tracking-tight">
                Configuração da Sessão
              </h2>
            </div>
            <p className="text-sm text-slate-500 ml-13">Configure os dados antes de iniciar os lançamentos</p>
          </div>

          {/* Checklist de requisitos */}
          <div className="flex flex-col gap-2 bg-white/80 backdrop-blur-sm p-4 rounded-2xl border border-slate-100 shadow-sm min-w-[220px]">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
              <Sparkles size={10} className="text-prevencidos-500" />
              Checklist de Início
            </p>
            <RequirementItem label="Empresa/Filial" met={!!(info.company && info.filial)} />
            <RequirementItem label="Nomes dos Responsáveis" met={!!(info.pharmacist && info.manager)} />
            <RequirementItem label="Cadastro Carregado" met={systemLoaded} />
            <RequirementItem label="Relatório DCB Carregado" met={dcbLoaded} />
            <RequirementItem label="Estoque da Filial Carregado" met={inventoryLoaded} />
            <RequirementItem label="Relatórios no Supabase" met={reportsReady} />
            <RequirementItem label="Produtos Identificados" met={productsLoaded} />
          </div>
        </div>
      </div>

      {/* Formulário principal */}
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Coluna esquerda: Empresa e Filial */}
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Building2 size={12} className="text-prevencidos-500" />
                EMPRESA
              </label>
              <select
                value={info.companyId || ''}
                onChange={handleCompanyChange}
                className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-prevencidos-400 focus:bg-white transition-all custom-select input-glow text-slate-700 font-medium"
              >
                <option value="">Selecione a empresa...</option>
                {companies.map(company => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <MapPin size={12} className="text-prevencidos-500" />
                FILIAL
              </label>
              {selectedCompany && branchOptions.length > 0 ? (
                <select
                  value={info.filial}
                  onChange={handleBranchChange}
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-prevencidos-400 focus:bg-white transition-all custom-select input-glow text-slate-700 font-medium"
                >
                  <option value="">Escolha a filial...</option>
                  {branchOptions.map(option => (
                    <option key={`${option.areaName}-${option.branchName}`} value={option.branchName}>
                      {option.branchName} {option.areaName ? `(${option.areaName})` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={info.filial}
                  onChange={handleBranchChange}
                  placeholder={!selectedCompany ? "Selecione uma empresa primeiro..." : "Digite o nome da filial..."}
                  disabled={!selectedCompany}
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-prevencidos-400 focus:bg-white transition-all input-glow text-slate-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                />
              )}
            </div>
          </div>

          {/* Coluna direita: Responsáveis */}
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <User size={12} className="text-prevencidos-500" />
                FARMACÊUTICO(A)
              </label>
              <input
                type="text"
                value={info.pharmacist}
                onChange={(e) => {
                  const nextInfo = { ...info, pharmacist: e.target.value };
                  setInfo(nextInfo);
                  emitInfoChange(nextInfo);
                }}
                placeholder="Nome do Farmacêutico Responsável"
                className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-prevencidos-400 focus:bg-white transition-all input-glow text-slate-700 font-medium"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Shield size={12} className="text-prevencidos-500" />
                GESTOR(A)
              </label>
              <input
                type="text"
                value={info.manager}
                onChange={(e) => {
                  const nextInfo = { ...info, manager: e.target.value };
                  setInfo(nextInfo);
                  emitInfoChange(nextInfo);
                }}
                placeholder="Nome do Gestor"
                className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-prevencidos-400 focus:bg-white transition-all input-glow text-slate-700 font-medium"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Upload de arquivos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className={`bg-white p-8 rounded-3xl border-2 border-dashed transition-all duration-300 flex flex-col items-center text-center group hover:shadow-md ${systemLoaded ? 'border-emerald-400 bg-emerald-50/20' : 'border-slate-200 hover:border-prevencidos-300'}`}>
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-all duration-300 ${systemLoaded ? 'bg-gradient-to-br from-emerald-100 to-emerald-200 text-emerald-600 shadow-md shadow-emerald-100' : 'bg-slate-100 text-slate-400 group-hover:bg-prevencidos-50 group-hover:text-prevencidos-500'}`}>
            <FileCode size={32} />
          </div>
          <h3 className="font-bold text-slate-800 mb-1">1. Cadastro do Sistema</h3>
          <p className="text-xs text-slate-400 mt-1 mb-6">Arquivo XML ou Excel (Colunas C/D/K) com os produtos cadastrados.</p>
          <label className={`px-6 py-3 rounded-xl text-sm font-bold cursor-pointer transition-all duration-300 shadow-sm ${systemLoaded ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-emerald-200 hover:shadow-emerald-300' : 'bg-white border-2 border-slate-200 text-slate-600 hover:border-prevencidos-300 hover:text-prevencidos-600'}`}>
            {systemLoaded ? <span className="flex items-center gap-2"><Check size={16} /> Carregado com Sucesso</span> : 'Selecionar Cadastro'}
            <input type="file" className="hidden" accept=".xml,.xlsx,.xls" onChange={(e) => e.target.files?.[0] && onSystemProductsUpload(e.target.files[0])} />
          </label>
          {systemReportSyncedAt && (
            <p className="mt-2 text-[11px] font-semibold text-emerald-700">
              Salvo no Supabase: {formatSupabaseDate(systemReportSyncedAt)}
            </p>
          )}
        </div>

        <div className={`bg-white p-8 rounded-3xl border-2 border-dashed transition-all duration-300 flex flex-col items-center text-center group hover:shadow-md ${dcbLoaded ? 'border-blue-400 bg-blue-50/20' : 'border-slate-200 hover:border-blue-300'}`}>
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-all duration-300 ${dcbLoaded ? 'bg-gradient-to-br from-blue-100 to-blue-200 text-blue-600 shadow-md shadow-blue-100' : 'bg-slate-100 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500'}`}>
            <FlaskConical size={32} />
          </div>
          <h3 className="font-bold text-slate-800 mb-1">2. Relatório DCB</h3>
          <p className="text-xs text-slate-400 mt-1 mb-6">Arquivo Excel agrupado por DCB (necessário para identificar similares).</p>
          <label className={`px-6 py-3 rounded-xl text-sm font-bold cursor-pointer transition-all duration-300 shadow-sm ${dcbLoaded ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-blue-200 hover:shadow-blue-300' : 'bg-white border-2 border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600'}`}>
            {dcbLoaded ? <span className="flex items-center gap-2"><Check size={16} /> Carregado com Sucesso</span> : 'Selecionar DCB'}
            <input type="file" className="hidden" accept=".xlsx,.xls" onChange={(e) => e.target.files?.[0] && onDCBBaseUpload(e.target.files[0])} />
          </label>
          {dcbReportSyncedAt && (
            <p className="mt-2 text-[11px] font-semibold text-blue-700">
              Salvo no Supabase: {formatSupabaseDate(dcbReportSyncedAt)}
            </p>
          )}
        </div>
      </div>

      {/* Status banner */}
      {!systemLoaded || !dcbLoaded ? (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 p-5 rounded-2xl border border-amber-200 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Info size={20} className="text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-amber-800">Requisito Pendente</p>
            <p className="text-xs text-amber-600 mt-0.5">Carregue ambos os arquivos (Cadastro + DCB) para liberar o botão de início.</p>
          </div>
        </div>
      ) : !reportsReady && !isReportsSyncing && !isBranchPrefetching && !branchPrefetchError ? (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 p-5 rounded-2xl border border-amber-200 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Info size={20} className="text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-amber-800">Sincronização pendente</p>
            <p className="text-xs text-amber-600 mt-0.5">Os relatórios ainda não foram reconhecidos no Supabase.</p>
          </div>
        </div>
      ) : branchPrefetchError ? (
        <div className="bg-gradient-to-r from-red-50 to-rose-50 p-5 rounded-2xl border border-red-200 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
            <Info size={20} className="text-red-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-red-800">Erro ao carregar filial</p>
            <p className="text-xs text-red-600 mt-0.5">{branchPrefetchError}</p>
          </div>
        </div>
      ) : !isReportsSyncing && !isBranchPrefetching && (
        <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 p-5 rounded-2xl text-white flex items-center gap-4 shadow-lg shadow-emerald-200">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <Check size={20} className="text-white" />
          </div>
          <p className="font-bold text-sm">Tudo pronto! Preencha os dados acima e clique em Iniciar.</p>
        </div>
      )}

      <div className="flex justify-center pt-2">
        <button
          disabled={!canStart || isSubmitting}
          onClick={async () => {
            setIsSubmitting(true);
            try {
              await onComplete(info);
            } finally {
              setIsSubmitting(false);
            }
          }}
          className={`px-16 py-5 rounded-2xl font-bold text-xl shadow-xl transition-all duration-300 relative overflow-hidden group min-w-[340px] flex justify-center ${canStart && !isSubmitting
            ? 'bg-gradient-to-r from-prevencidos-500 via-prevencidos-600 to-prevencidos-700 text-white hover:shadow-2xl hover:shadow-prevencidos-300/50 hover:-translate-y-1 active:scale-95'
            : isSubmitting
              ? 'bg-blue-100 text-blue-500 cursor-not-allowed shadow-none border-2 border-blue-200'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
            }`}
        >
          {canStart && !isSubmitting && (
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
          )}
          <span className="relative z-10 flex items-center gap-3">
            {isSubmitting && (
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            )}
            {isSubmitting ? <span className="animate-pulse">SINCRONIZANDO CADASTROS...</span> : 'INICIAR LANÇAMENTOS'}
            {canStart && !isSubmitting && <ArrowRight size={22} className="transition-transform duration-300 group-hover:translate-x-1" />}
          </span>
        </button>
      </div>

      {/* Histórico de uploads */}
      {uploadHistory && uploadHistory.length > 0 && (
        <div className="mt-8 pt-8 border-t border-slate-100">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-5 flex items-center gap-2">
            <FileText size={16} className="text-prevencidos-500" />
            Histórico de Uploads de Vendas (Filial)
          </h3>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-gradient-to-r from-slate-50 to-slate-100 text-slate-500 font-bold uppercase text-xs">
                <tr>
                  <th className="px-6 py-4">Data/Hora Relatório</th>
                  <th className="px-6 py-4">Período Venda</th>
                  <th className="px-6 py-4">Arquivo</th>
                  <th className="px-6 py-4">Responsável</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {uploadHistory.map((upload) => (
                  <tr key={upload.id} className="hover:bg-prevencidos-50/30 transition-colors duration-150">
                    <td className="px-6 py-4 text-slate-600">
                      {formatSupabaseDate(upload.uploaded_at) || '-'}
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-800">
                      {upload.period_label}
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs font-mono">
                      {upload.file_name || '-'}
                    </td>
                    <td className="px-6 py-4 text-slate-500">
                      {upload.user_email?.split('@')[0]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {inventoryReport && (
        <div className="mt-8 pt-6 border-t border-slate-100">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-5 flex items-center gap-2">
            <FileCode size={16} className="text-amber-500" />
            Histórico de Upload de Estoque (Filial)
          </h3>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-gradient-to-r from-slate-50 to-slate-100 text-slate-500 font-bold uppercase text-xs">
                <tr>
                  <th className="px-6 py-4">Data Upload</th>
                  <th className="px-6 py-4">Arquivo</th>
                  <th className="px-6 py-4">Itens</th>
                  <th className="px-6 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                <tr className="hover:bg-amber-50/30 transition-colors duration-150">
                  <td className="px-6 py-4 text-slate-600">
                    {formatSupabaseDate(inventoryReport.uploaded_at) || '-'}
                  </td>
                  <td className="px-6 py-4 text-slate-500 text-xs font-mono">
                    {inventoryReport.file_name || '-'}
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-800">
                    {(inventoryReport.records || []).length.toLocaleString('pt-BR')}
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase tracking-wider px-3 py-1">
                      Carregado
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default SetupView;
