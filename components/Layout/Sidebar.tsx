import React from 'react';
import {
    Clipboard,
    LayoutDashboard,
    History,
    Package,
    ClipboardList,
    Settings,
    Lock,
    MessageSquareQuote,
    LogOut,
    CheckCircle,
    Building2,
    MapPin,
    Store,
    Search
} from 'lucide-react';
import { User, ChecklistDefinition, AppConfig, AccessLevelId } from '../../types';
import { Logo } from './Logo';
import { PRE_VENCIDOS_MODULE_ENABLED } from '../../src/featureFlags';

interface SidebarProps {
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

export const Sidebar: React.FC<SidebarProps> = ({
    isSidebarOpen,
    setIsSidebarOpen,
    currentUser,
    currentTheme,
    displayConfig,
    companies,
    checklists,
    activeChecklistId,
    setActiveChecklistId,
    ignoredChecklists,
    currentView,
    handleViewChange,
    handleLogout,
    isChecklistComplete,
    canControlChecklists
}) => {
    return (
        <aside
            className={`fixed inset-y-0 left-0 z-50 w-72 bg-white/80 backdrop-blur-xl shadow-[0_0_40px_rgba(0,0,0,0.08)] transform transition-transform duration-500 ease-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static lg:inset-auto no-print flex flex-col border-r border-gray-100/50`}
        >
            {/* Header / Logo Section */}
            <div className={`h-28 flex items-center justify-center p-4 relative overflow-hidden group mb-2`}>
                <div className={`absolute inset-0 bg-gradient-to-br transition-all duration-700 ${currentTheme.bgGradient || 'from-blue-600 to-blue-800'} opacity-90 group-hover:opacity-100`}></div>
                <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] pointer-events-none"></div>

                {/* Decorative orbs in logo area */}
                <div className="absolute top-[-20%] right-[-20%] w-32 h-32 bg-white/10 rounded-full blur-2xl animate-pulse-slow"></div>
                <div className="absolute bottom-[-10%] left-[-10%] w-24 h-24 bg-white/5 rounded-full blur-xl"></div>

                <div className="relative z-10 w-full flex justify-center transform transition-all duration-500 group-hover:scale-105">
                    <Logo config={displayConfig} companies={companies} selectedCompanyId={currentUser.company_id} />
                </div>

                <button
                    onClick={() => handleViewChange('settings')}
                    className="absolute top-4 right-4 p-2 text-white/60 hover:text-white hover:bg-white/20 rounded-full transition-all duration-300 hover:rotate-90 z-20"
                    title="Configurar Marca"
                >
                    <Settings size={16} />
                </button>
            </div>

            {/* Profile Section */}
            <div className="px-6 py-6 mb-4 relative mx-4 mt-2 rounded-3xl bg-gradient-to-br from-gray-50/50 to-white border border-gray-100 shadow-sm overflow-hidden group transition-all duration-300 hover:shadow-md hover:border-gray-200">
                <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50/50 rounded-full blur-xl transition-all duration-500 group-hover:bg-blue-100/50"></div>

                <div className="flex items-center gap-4 relative z-10">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-xl ${currentTheme.bgGradient || 'bg-blue-600'} shadow-lg border-2 border-white overflow-hidden transform transition-all duration-300 group-hover:rotate-3 group-hover:scale-110`}>
                        {currentUser.photo ? (
                            <img src={currentUser.photo} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                            currentUser.name.charAt(0)
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate tracking-tight">{currentUser.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`w-2 h-2 rounded-full animate-pulse-slow ${currentUser.approved ? 'bg-emerald-500' : 'bg-gray-400'}`}></span>
                            <p className="text-[10px] text-gray-500 truncate uppercase tracking-widest font-black">
                                {currentUser.role === 'MASTER' ? 'Administrador' : 'Usuário'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Company/Area/Filial info */}
                {(currentUser.company_id || currentUser.area || currentUser.filial) && (
                    <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col gap-2 relative z-10">
                        {currentUser.company_id && (() => {
                            const comp = companies.find((c: any) => c.id === currentUser.company_id);
                            return comp ? (
                                <div className="badge bg-blue-50/50 text-blue-600 border-blue-100/50 flex items-center gap-2 group/item transition-all hover:bg-blue-50">
                                    <Building2 size={12} className="text-blue-500" />
                                    <span className="truncate flex-1">{comp.name}</span>
                                </div>
                            ) : null;
                        })()}
                        <div className="flex items-center gap-2">
                            {currentUser.area && (
                                <div className="badge bg-gray-50/50 text-gray-600 border-gray-100/50 flex-1 flex items-center gap-1.5 text-[9px]">
                                    <MapPin size={10} className="text-gray-400" />
                                    <span className="truncate">{currentUser.area}</span>
                                </div>
                            )}
                            {currentUser.filial && (
                                <div className="badge bg-gray-50/50 text-gray-600 border-gray-100/50 flex-1 flex items-center gap-1.5 text-[9px]">
                                    <Store size={10} className="text-gray-400" />
                                    <span className="truncate">{currentUser.filial}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Navigation Menu */}
            <nav className="flex-1 px-4 py-2 space-y-1.5 overflow-y-auto custom-scrollbar">
                <p className="px-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3 mt-4">Menu Principal</p>

                <SidebarButton
                    icon={<LayoutDashboard size={20} />}
                    label="Dashboard"
                    active={currentView === 'summary'}
                    onClick={() => handleViewChange('summary')}
                    color="blue"
                />

                <SidebarButton
                    icon={<ClipboardList size={20} />}
                    label="Checklists"
                    active={currentView === 'checklist'}
                    onClick={() => handleViewChange('checklist')}
                    color="emerald"
                />

                {PRE_VENCIDOS_MODULE_ENABLED && (
                    <SidebarButton
                        icon={<Package size={20} />}
                        label="Pré-Vencidos"
                        active={currentView === 'pre'}
                        onClick={() => handleViewChange('pre')}
                        color="amber"
                    />
                )}

                <SidebarButton
                    icon={<Search size={20} />}
                    label="Conferência"
                    active={currentView === 'stock'}
                    onClick={() => handleViewChange('stock')}
                    color="cyan"
                />

                <SidebarButton
                    icon={<ClipboardList size={20} />}
                    label="Auditoria"
                    active={currentView === 'audit'}
                    onClick={() => handleViewChange('audit')}
                    color="indigo"
                />

                <SidebarButton
                    icon={<History size={20} />}
                    label="Histórico"
                    active={currentView === 'history'}
                    onClick={() => handleViewChange('history')}
                    color="purple"
                />

                <SidebarButton
                    icon={<MessageSquareQuote size={20} />}
                    label="Suporte"
                    active={currentView === 'support'}
                    onClick={() => handleViewChange('support')}
                    color="rose"
                />

                {currentUser.role === 'MASTER' && (
                    <>
                        <p className="px-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3 mt-8">Administração</p>
                        <SidebarButton
                            icon={<Settings size={20} />}
                            label="Configurações"
                            active={currentView === 'settings'}
                            onClick={() => handleViewChange('settings')}
                            color="slate"
                        />
                        <SidebarButton
                            icon={<Lock size={20} />}
                            label="Acessos"
                            active={currentView === 'access'}
                            onClick={() => handleViewChange('access')}
                            color="indigo"
                        />
                    </>
                )}
            </nav>

            {/* Logout Footer */}
            <div className="p-4 mt-auto">
                <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-6 py-4 text-rose-500 hover:text-white hover:bg-rose-500 rounded-2xl transition-all duration-300 font-bold group relative overflow-hidden"
                >
                    <div className="absolute inset-0 bg-rose-500/10 group-hover:bg-rose-500 transition-all duration-300"></div>
                    <LogOut size={20} className="relative z-10 group-hover:scale-110 transition-transform" />
                    <span className="relative z-10">Sair do Sistema</span>
                </button>
            </div>
        </aside>
    );
};

interface SidebarButtonProps {
    icon: React.ReactNode;
    label: string;
    active: boolean;
    onClick: () => void;
    color: 'blue' | 'emerald' | 'amber' | 'cyan' | 'purple' | 'rose' | 'slate' | 'indigo';
}

const SidebarButton: React.FC<SidebarButtonProps> = ({ icon, label, active, onClick, color }) => {
    const colorClasses = {
        blue: active ? 'bg-blue-50 text-blue-600 border-blue-100 shadow-sm' : 'text-gray-500 hover:bg-blue-50/50 hover:text-blue-500',
        emerald: active ? 'bg-emerald-50 text-emerald-600 border-emerald-100 shadow-sm' : 'text-gray-500 hover:bg-emerald-50/50 hover:text-emerald-500',
        amber: active ? 'bg-amber-50 text-amber-600 border-amber-100 shadow-sm' : 'text-gray-500 hover:bg-amber-50/50 hover:text-amber-500',
        cyan: active ? 'bg-cyan-50 text-cyan-600 border-cyan-100 shadow-sm' : 'text-gray-500 hover:bg-cyan-50/50 hover:text-cyan-500',
        purple: active ? 'bg-purple-50 text-purple-600 border-purple-100 shadow-sm' : 'text-gray-500 hover:bg-purple-50/50 hover:text-purple-500',
        rose: active ? 'bg-rose-50 text-rose-600 border-rose-100 shadow-sm' : 'text-gray-500 hover:bg-rose-50/50 hover:text-rose-500',
        slate: active ? 'bg-slate-50 text-slate-600 border-slate-100 shadow-sm' : 'text-gray-500 hover:bg-slate-50/50 hover:text-slate-500',
        indigo: active ? 'bg-indigo-50 text-indigo-600 border-indigo-100 shadow-sm' : 'text-gray-500 hover:bg-indigo-50/50 hover:text-indigo-500',
    };

    const iconColorClasses = {
        blue: active ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-500',
        emerald: active ? 'text-emerald-600' : 'text-gray-400 group-hover:text-emerald-500',
        amber: active ? 'text-amber-600' : 'text-gray-400 group-hover:text-amber-500',
        cyan: active ? 'text-cyan-600' : 'text-gray-400 group-hover:text-cyan-500',
        purple: active ? 'text-purple-600' : 'text-gray-400 group-hover:text-purple-500',
        rose: active ? 'text-rose-600' : 'text-gray-400 group-hover:text-rose-500',
        slate: active ? 'text-slate-600' : 'text-gray-400 group-hover:text-slate-500',
        indigo: active ? 'text-indigo-600' : 'text-gray-400 group-hover:text-indigo-500',
    };

    const accentColors = {
        blue: 'bg-blue-600',
        emerald: 'bg-emerald-600',
        amber: 'bg-amber-600',
        cyan: 'bg-cyan-600',
        purple: 'bg-purple-600',
        rose: 'bg-rose-600',
        slate: 'bg-slate-600',
        indigo: 'bg-indigo-600',
    };

    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-300 font-bold group border-2 border-transparent ${colorClasses[color]} relative`}
        >
            {active && (
                <div className={`absolute left-0 w-1.5 h-6 rounded-r-full ${accentColors[color]}`}></div>
            )}
            <div className={`transition-all duration-300 transform group-hover:scale-110 ${iconColorClasses[color]}`}>
                {icon}
            </div>
            <span className="flex-1 text-left tracking-tight">{label}</span>
            {active && <div className="animate-in fade-in zoom-in duration-300">
                <div className={`w-1.5 h-1.5 rounded-full ${accentColors[color]}`}></div>
            </div>}
        </button>
    );
};
