import React from 'react';
import { RotateCcw, FileCheck } from 'lucide-react';
import { User, AppConfig, ChecklistDefinition } from '../../types';
import { Logo } from './Logo';
import { PRE_VENCIDOS_MODULE_ENABLED } from '../../src/featureFlags';

interface HeaderProps {
    currentUser: User;
    currentTheme: any;
    displayConfig: AppConfig;
    companies: any[];
    isSidebarOpen: boolean;
    setIsSidebarOpen: (open: boolean) => void;
    currentView: string;
    activeChecklist: ChecklistDefinition;
    activeChecklistId: string;
    canControlChecklists: boolean;
    handleResetChecklist: () => void;
    openChecklistEditor: (id: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
    currentUser,
    currentTheme,
    displayConfig,
    companies,
    isSidebarOpen,
    setIsSidebarOpen,
    currentView,
    activeChecklist,
    activeChecklistId,
    canControlChecklists,
    handleResetChecklist,
    openChecklistEditor
}) => {
    const getTitle = () => {
        if (currentView === 'report' || currentView === 'view_history') return 'Relatório Consolidado';
        if (currentView === 'dashboard') return 'Dashboard (BI em construção)';
        if (currentView === 'summary') return 'Visão Geral da Avaliação';
        if (currentView === 'settings') return 'Configurações do Sistema';
        if (currentView === 'access') return 'Níveis de Acesso';
        if (currentView === 'history') return 'Histórico de Relatórios';
        if (currentView === 'pre' && PRE_VENCIDOS_MODULE_ENABLED) return 'Pré-Vencidos';
        if (currentView === 'stock') return 'Conferência de Estoque';
        if (currentView === 'audit') return 'Auditoria';
        if (currentView === 'logs') return 'Métricas Gerenciais';
        if (currentView === 'cadastros_globais') return 'Cadastros Base Globais';
        if (currentView === 'support') return 'Suporte e Melhorias';
        if (currentView === 'analise_resultados') return 'Análise de Resultados';
        return activeChecklist.title;
    };

    const title = getTitle();

    return (
        <>
            {/* Header - Premium Glassmorphism */}
            <header className="flex items-center justify-between h-20 lg:h-24 bg-white/60 backdrop-blur-2xl border-b border-gray-100/50 px-4 lg:px-10 shadow-[0_4px_20px_rgba(0,0,0,0.02)] no-print sticky top-0 z-40 animate-fade-in transition-all duration-500">
                <div className="flex flex-col">
                    <h1 className="text-2xl lg:text-3xl font-black bg-gradient-to-r from-gray-800 to-gray-500 bg-clip-text text-transparent truncate tracking-tighter animate-slide-in-right">
                        {title}
                    </h1>
                    <div className="flex items-center gap-2 mt-1 animate-fade-in" style={{ animationDelay: '0.2s' }}>
                        <div className={`w-2 h-2 rounded-full ${currentTheme.bg || 'bg-blue-500'} animate-pulse`}></div>
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Sessão Ativa</span>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    {/* Desktop Logo in Header */}
                    <div className="mr-4 opacity-80 hover:opacity-100 transition-all duration-500 scale-95 origin-right hidden xl:block hover:scale-100 transform translate-y-1">
                        <Logo config={displayConfig} companies={companies} selectedCompanyId={currentUser.company_id} />
                    </div>

                    <div className="h-10 w-px bg-gray-100 hidden xl:block"></div>

                    <div className="flex items-center gap-3">
                        {currentView === 'checklist' && canControlChecklists && (
                            <button
                                onClick={handleResetChecklist}
                                className="flex items-center gap-2.5 bg-white border-2 border-slate-100 text-slate-600 hover:text-rose-600 hover:border-rose-100 hover:bg-rose-50 px-5 py-3 rounded-2xl transition-all duration-300 text-xs font-black uppercase tracking-widest shadow-sm group active:scale-95"
                                title="Recomeçar Checklist"
                            >
                                <RotateCcw size={16} className="transition-transform duration-500 group-hover:rotate-180" />
                                <span>Recomeçar</span>
                            </button>
                        )}

                        {currentView === 'checklist' && currentUser?.role === 'MASTER' && (
                            <button
                                onClick={() => openChecklistEditor(activeChecklistId)}
                                className={`flex items-center gap-2.5 ${currentTheme.bgGradient || 'bg-blue-600'} text-white px-5 py-3 rounded-2xl transition-all duration-300 text-xs font-black uppercase tracking-widest shadow-lg shadow-blue-200/50 hover:shadow-xl hover:-translate-y-0.5 group active:scale-95`}
                                title="Editar Estrutura"
                            >
                                <FileCheck size={16} className="transition-transform duration-300 group-hover:scale-110" />
                                <span>Configurar Items</span>
                            </button>
                        )}
                    </div>
                </div>
            </header>
        </>

    );
};
