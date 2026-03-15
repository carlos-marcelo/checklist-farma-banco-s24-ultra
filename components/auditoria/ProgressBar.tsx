
import React from 'react';

interface ProgressBarProps {
    percentage: number;
    label?: string;
    size?: 'sm' | 'md' | 'lg';
    tone?: 'auto' | 'blue' | 'green';
}

const ProgressBar: React.FC<ProgressBarProps> = ({ percentage, label, size = 'md', tone = 'auto' }) => {
    const height = size === 'sm' ? 'h-1.5' : size === 'md' ? 'h-2' : 'h-3';

    const getColor = (p: number) => {
        if (tone === 'green') return 'bg-emerald-500';
        if (tone === 'blue') return 'bg-blue-500';
        if (p >= 100) return 'bg-emerald-500';
        if (p > 50) return 'bg-indigo-500';
        if (p > 0) return 'bg-amber-500';
        return 'bg-slate-200';
    };

    const getTextColor = (p: number) => {
        if (tone === 'green') return 'text-emerald-600';
        if (tone === 'blue') return 'text-blue-700';
        if (p >= 100) return 'text-emerald-600';
        return 'text-slate-900';
    };

    return (
        <div className="w-full">
            <div className="flex justify-between mb-2 items-center">
                {label && <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest italic">{label}</span>}
                <span className={`text-[11px] font-black ${getTextColor(percentage)}`}>{Math.round(percentage)}%</span>
            </div>
            <div className={`w-full bg-slate-100 rounded-full ${height} overflow-hidden shadow-inner`}>
                <div
                    className={`h-full transition-all duration-700 ease-out shadow-sm ${getColor(percentage)}`}
                    style={{ width: `${Math.min(100, percentage)}%` }}
                ></div>
            </div>
        </div>
    );
};

export default ProgressBar;
