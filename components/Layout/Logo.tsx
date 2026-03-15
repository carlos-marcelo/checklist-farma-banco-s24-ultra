import React from 'react';
import { AppConfig } from '../../types';

// Custom MF Shield Logo
export const MFLogo = ({ className = "w-12 h-12" }: { className?: string }) => (
    <img src="/logos/mf-shield.svg" alt="MF Shield" className={className} loading="lazy" />
);

// Logo Component (Dynamic Dual Display)
export const Logo = ({ config, large = false, companies = [], selectedCompanyId = null }: { config: AppConfig, large?: boolean, companies?: any[], selectedCompanyId?: string | null }) => {
    // Determine which logo/name to show
    const selectedCompany = companies.find((c: any) => c.id === selectedCompanyId);

    // If no company is selected, we fall back to the system logo and slogan only.
    const displayLogo = selectedCompany ? (selectedCompany.logo || null) : null;
    const displayName = selectedCompany ? selectedCompany.name : '';
    const showSlogan = !selectedCompanyId; // Always show slogan if no company selected

    // Divider Logic: Show only when we actually have a logo or company name to highlight.
    const showDivider = !!displayLogo || !!displayName;

    return (
        <div className="flex items-center gap-3">
            {/* System Logo (MF) */}
            <div className={`relative ${large ? 'w-[6.666rem] h-[6.666rem]' : 'w-10 h-10'} flex-shrink-0 filter drop-shadow-md`}>
                <MFLogo className="w-full h-full" />
            </div>

            {/* Divider if needed */}
            {showDivider && (
                <div className={`h-8 w-px ${large ? 'bg-gray-300' : 'bg-white/30'} mx-1`}></div>
            )}

            {/* Client/Pharmacy Logo or Name */}
            <div className="flex items-center gap-3">
                {displayLogo && (
                    <div className={`${large ? 'h-20 w-auto' : 'h-10 w-auto'} bg-white rounded-md p-1 shadow-sm`}>
                        <img src={displayLogo} alt="Company Logo" className="h-full w-auto object-contain" />
                    </div>
                )}

                {(!displayLogo || large) && (
                    <div className={`flex flex-col justify-center ${large ? 'text-gray-800' : 'text-white'}`}>
                        <span className={`font-black ${large ? 'text-2xl' : 'text-base'} uppercase tracking-tight leading-none`}>
                            {displayName}
                        </span>
                        {showSlogan && (
                            <span className={`text-[10px] font-bold uppercase tracking-widest opacity-80 ${large ? 'text-gray-500' : 'text-white'}`}>
                                Gestão & Excelência
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
// LogoPrint for reports
export const LogoPrint = ({ config, theme }: { config: AppConfig, theme: any }) => {
    return (
        <div className={`flex items-center justify-between mb-8 pb-6 border-b-4 ${theme.border}`}>
            {/* Left: Client Logo */}
            <div className="flex items-center gap-4">
                {config.logo ? (
                    <img src={config.logo} alt="Logo" className="h-28 w-auto object-contain" />
                ) : (
                    <div className="w-24 h-24 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400 font-bold border-2 border-dashed border-gray-300">LOGO</div>
                )}
                <div>
                    <div className={`font-black text-lg leading-tight uppercase tracking-wide ${theme.text}`}>
                        {config.pharmacyName}
                    </div>
                    <div className="text-gray-500 font-bold tracking-wide text-[10px] mt-1">RELATÓRIO DE AVALIAÇÃO</div>
                </div>
            </div>

            {/* Right: System Logo */}
            <div className="flex flex-col items-end opacity-60">
                <div className="w-12 h-12">
                    <MFLogo className="w-full h-full" />
                </div>
                <div className="text-[10px] font-bold uppercase text-gray-500 mt-1">System by Marcelo Far</div>
            </div>
        </div>
    );
};
