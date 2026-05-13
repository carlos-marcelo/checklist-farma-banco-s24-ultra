import React, { useEffect, useMemo } from 'react';
import {
    Menu,
    X,
    LayoutDashboard,
    LayoutGrid,
    History,
    FileSearch,
    Package,
    ClipboardList,
    Settings,
    Lock,
    MessageSquareQuote,
    LogOut,
    Building2,
    MapPin,
    Store,
    Search,
    FolderArchive,
    LineChart
} from 'lucide-react';
import { User, ChecklistDefinition, AppConfig } from '../../types';
import { Logo } from './Logo';
import { PRE_VENCIDOS_MODULE_ENABLED } from '../../src/featureFlags';

interface TopbarProps {
    isSidebarOpen: boolean;
    setIsSidebarOpen: (open: boolean) => void;
    currentUser: User;
    currentTheme: any;
    displayConfig: AppConfig;
    companies: any[];
    checklists: ChecklistDefinition[];
    activeChecklistId: string;
    setActiveChecklistId: (id: string) => void;
    ignoredChecklists: Set<string>;
    currentView: string;
    handleViewChange: (view: any) => void;
    handleLogout: () => void;
    isChecklistComplete: (id: string) => boolean;
    canControlChecklists: boolean;
}

export const Topbar: React.FC<TopbarProps> = ({
    isSidebarOpen,
    setIsSidebarOpen,
    currentUser,
    currentTheme,
    displayConfig,
    companies,
    currentView,
    handleViewChange,
    handleLogout
}) => {
    const isMaster = currentUser.role === 'MASTER';
    const isAdmin = currentUser.role === 'ADMINISTRATIVO';
    const canViewAnalise = isMaster || isAdmin;
    const navItems = [
        { label: 'Dashboard', view: 'dashboard', color: 'blue', icon: <LayoutDashboard size={18} />, shortcut: 'Ctrl + D' },
        ...(canViewAnalise ? [{ label: 'Análise de Resultados', view: 'analise_resultados', color: 'blue', icon: <LineChart size={18} /> }] : []),
        { label: 'Checklists', view: 'checklist', color: 'emerald', icon: <ClipboardList size={18} />, shortcut: 'Ctrl + L' },
        { label: 'Visão Geral', view: 'summary', color: 'indigo', icon: <LayoutGrid size={18} /> },
        { label: 'Conferência', view: 'stock', color: 'cyan', icon: <Search size={18} />, shortcut: 'Ctrl + C' },
        { label: 'Auditoria', view: 'audit', color: 'indigo', icon: <ClipboardList size={18} />, shortcut: 'Ctrl + A' },
        { label: 'Histórico', view: 'history', color: 'purple', icon: <History size={18} />, shortcut: 'Ctrl + H' },
        { label: 'Suporte', view: 'support', color: 'rose', icon: <MessageSquareQuote size={18} /> }
    ].concat(PRE_VENCIDOS_MODULE_ENABLED ? [{ label: 'Pré-Vencidos', view: 'pre', color: 'amber', icon: <Package size={18} />, shortcut: 'Ctrl + V' }] : [])
    .filter(item => (item.view !== 'logs' || isMaster));

    if (isMaster) {
        navItems.splice(navItems.findIndex(item => item.view === 'support'), 0, { label: 'Métricas Gerenciais', view: 'logs', color: 'slate', icon: <FileSearch size={18} />, shortcut: 'Ctrl + M' });
    }

    const commonAdminItems = [
        { label: 'Configurações', view: 'settings', color: 'slate', icon: <Settings size={18} /> }
    ];

    const masterOnlyAdminItems = [
        { label: 'Acessos', view: 'access', color: 'indigo', icon: <Lock size={18} /> },
        { label: 'Cadastros Base', view: 'cadastros_globais', color: 'slate', icon: <FolderArchive size={18} />, shortcut: 'Ctrl + B' }
    ];

    const shortcutMap = useMemo<Record<string, string>>(() => {
        const map: Record<string, string> = {
            d: 'dashboard',
            l: 'checklist',
            c: 'stock',
            a: 'audit',
            h: 'history'
        };
        if (PRE_VENCIDOS_MODULE_ENABLED) {
            map.v = 'pre';
        }
        if (isMaster) {
            map.m = 'logs';
            map.b = 'cadastros_globais';
        }
        return map;
    }, [isMaster]);

    useEffect(() => {
        const isEditableTarget = (target: EventTarget | null) => {
            const element = target as HTMLElement | null;
            if (!element) return false;
            const tag = element.tagName?.toLowerCase();
            return (
                tag === 'input' ||
                tag === 'textarea' ||
                tag === 'select' ||
                !!element.closest('input, textarea, select, [contenteditable=\"true\"]')
            );
        };

        const onKeyDown = (event: KeyboardEvent) => {
            if ((!event.ctrlKey && !event.metaKey) || event.altKey || event.shiftKey) return;
            if (isEditableTarget(event.target)) return;
            const key = event.key.toLowerCase();
            const targetView = shortcutMap[key];
            if (!targetView) return;
            event.preventDefault();
            handleViewChange(targetView);
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [handleViewChange, shortcutMap]);

    const company = currentUser.company_id ? companies.find((c: any) => c.id === currentUser.company_id) : null;

    return (
        <div className="no-print sticky top-0 z-50 bg-white/80 backdrop-blur-2xl border-b border-gray-100/70 shadow-[0_4px_18px_rgba(15,23,42,0.06)]">
            <div className="px-4 lg:px-8 py-3 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <button
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            className={`${currentTheme.bgGradient || 'bg-blue-600'} text-white p-2.5 rounded-2xl shadow-lg transition-all duration-300 hover:scale-105 active:scale-95 lg:hidden`}
                            title="Menu"
                        >
                            {isSidebarOpen ? <X size={18} /> : <Menu size={18} />}
                        </button>
                        <div className="flex items-center gap-3">
                            <Logo config={displayConfig} companies={companies} selectedCompanyId={currentUser.company_id} />
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="hidden md:flex items-center gap-3 rounded-2xl bg-white/70 border border-gray-100 px-3 py-2 shadow-sm">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold ${currentTheme.bgGradient || 'bg-blue-600'} overflow-hidden`}>
                                {currentUser.photo ? (
                                    <img src={currentUser.photo} alt="Profile" className="w-full h-full object-cover" />
                                ) : (
                                    currentUser.name.charAt(0)
                                )}
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs font-bold text-gray-900 truncate">{currentUser.name}</p>
                                <p className="text-[10px] uppercase tracking-widest text-gray-400 font-black">
                                    {currentUser.role === 'MASTER' ? 'Administrador' : 'Usuário'}
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white transition-all duration-300 font-bold text-xs uppercase tracking-widest shadow-sm"
                            title="Sair do Sistema"
                        >
                            <LogOut size={16} />
                            <span className="hidden sm:inline">Sair do Sistema</span>
                        </button>
                    </div>
                </div>

                {(company || currentUser.area || currentUser.filial) && (
                    <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold text-gray-600">
                        {company && (
                            <div className="badge bg-blue-50/70 text-blue-600 border-blue-100/60 flex items-center gap-2">
                                <Building2 size={12} />
                                <span className="truncate max-w-[220px]">{company.name}</span>
                            </div>
                        )}
                        {currentUser.area && (
                            <div className="badge bg-gray-50/70 text-gray-600 border-gray-100/60 flex items-center gap-2">
                                <MapPin size={12} />
                                <span className="truncate max-w-[180px]">{currentUser.area}</span>
                            </div>
                        )}
                        {currentUser.filial && (
                            <div className="badge bg-gray-50/70 text-gray-600 border-gray-100/60 flex items-center gap-2">
                                <Store size={12} />
                                <span className="truncate max-w-[180px]">{currentUser.filial}</span>
                            </div>
                        )}
                    </div>
                )}

                <div
                    className={`flex flex-wrap items-center gap-2 transition-all duration-300 ${isSidebarOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0 overflow-hidden'} lg:max-h-none lg:opacity-100`}
                >
                    {navItems.map(item => (
                        <TopbarButton
                            key={item.view}
                            icon={item.icon}
                            label={item.label}
                            active={currentView === item.view}
                            onClick={() => handleViewChange(item.view)}
                            color={item.color as TopbarButtonProps['color']}
                            title={item.shortcut ? `${item.label} (${item.shortcut})` : item.label}
                        />
                    ))}

                    <div className="h-6 w-px bg-gray-200 mx-2 hidden lg:block"></div>
                    {commonAdminItems.map(item => (
                        <TopbarButton
                            key={item.view}
                            icon={item.icon}
                            label={item.label}
                            active={currentView === item.view}
                            onClick={() => handleViewChange(item.view)}
                            color={item.color as TopbarButtonProps['color']}
                            title={item.label}
                        />
                    ))}

                    {currentUser.role === 'MASTER' && (
                        <>
                            {masterOnlyAdminItems.map(item => (
                                <TopbarButton
                                    key={item.view}
                                    icon={item.icon}
                                    label={item.label}
                                    active={currentView === item.view}
                                    onClick={() => handleViewChange(item.view)}
                                    color={item.color as TopbarButtonProps['color']}
                                    title={item.shortcut ? `${item.label} (${item.shortcut})` : item.label}
                                />
                            ))}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

interface TopbarButtonProps {
    icon: React.ReactNode;
    label: string;
    active: boolean;
    onClick: () => void;
    color: 'blue' | 'emerald' | 'amber' | 'cyan' | 'purple' | 'rose' | 'slate' | 'indigo';
    title?: string;
}

const TopbarButton: React.FC<TopbarButtonProps> = ({ icon, label, active, onClick, color, title }) => {
    const colorClasses = {
        blue: active ? 'bg-blue-50 text-blue-600 border-blue-100' : 'text-gray-500 hover:bg-blue-50/60 hover:text-blue-600',
        emerald: active ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'text-gray-500 hover:bg-emerald-50/60 hover:text-emerald-600',
        amber: active ? 'bg-amber-50 text-amber-600 border-amber-100' : 'text-gray-500 hover:bg-amber-50/60 hover:text-amber-600',
        cyan: active ? 'bg-cyan-50 text-cyan-600 border-cyan-100' : 'text-gray-500 hover:bg-cyan-50/60 hover:text-cyan-600',
        purple: active ? 'bg-purple-50 text-purple-600 border-purple-100' : 'text-gray-500 hover:bg-purple-50/60 hover:text-purple-600',
        rose: active ? 'bg-rose-50 text-rose-600 border-rose-100' : 'text-gray-500 hover:bg-rose-50/60 hover:text-rose-600',
        slate: active ? 'bg-slate-50 text-slate-600 border-slate-100' : 'text-gray-500 hover:bg-slate-50/60 hover:text-slate-600',
        indigo: active ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'text-gray-500 hover:bg-indigo-50/60 hover:text-indigo-600'
    };

    const iconColorClasses = {
        blue: active ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-500',
        emerald: active ? 'text-emerald-600' : 'text-gray-400 group-hover:text-emerald-500',
        amber: active ? 'text-amber-600' : 'text-gray-400 group-hover:text-amber-500',
        cyan: active ? 'text-cyan-600' : 'text-gray-400 group-hover:text-cyan-500',
        purple: active ? 'text-purple-600' : 'text-gray-400 group-hover:text-purple-500',
        rose: active ? 'text-rose-600' : 'text-gray-400 group-hover:text-rose-500',
        slate: active ? 'text-slate-600' : 'text-gray-400 group-hover:text-slate-500',
        indigo: active ? 'text-indigo-600' : 'text-gray-400 group-hover:text-indigo-500'
    };

    return (
        <button
            onClick={onClick}
            title={title || label}
            className={`flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-black uppercase tracking-wider transition-all duration-300 group ${colorClasses[color]}`}
        >
            <span className={`transition-transform duration-300 group-hover:scale-110 ${iconColorClasses[color]}`}>
                {icon}
            </span>
            <span className="whitespace-nowrap">{label}</span>
        </button>
    );
};
