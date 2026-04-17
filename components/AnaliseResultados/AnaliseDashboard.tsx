import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, 
    PieChart, Pie, Cell 
} from 'recharts';
import { Loader2, DollarSign, Target, Activity, MonitorSmartphone, Package, TrendingUp, Filter, MapPin, Building2 } from 'lucide-react';
import { User, CompanyArea } from '../../types';
import * as SupabaseService from '../../supabaseService';

interface AnaliseDashboardProps {
    currentUser: User;
    companies?: any[];
}

interface SalesGroupData {
    branchName: string;
    areaName: string;
    name: string;      
    estoque: number;
    volumeVend: number;
    vlrCusto: number;
    ticket: number;
    ticketCount: number; // to rebuild average
    rentabilidade: number; 
    participacao?: number; // % contribution to total sales
}

interface RawDataState {
    loading: boolean;
    error: string | null;
    rawLinesVendas: SalesGroupData[];
    rawLinesEcom: { branchName: string, valor: number }[];
    rawBranchTickets: Record<string, number>;
}

export const AnaliseDashboard: React.FC<AnaliseDashboardProps> = ({ currentUser, companies = [] }) => {
    const [rawState, setRawState] = useState<RawDataState>({
        loading: true,
        error: null,
        rawLinesVendas: [],
        rawLinesEcom: [],
        rawBranchTickets: {}
    });

    const [selectedArea, setSelectedArea] = useState<string>('ALL');
    const [selectedBranch, setSelectedBranch] = useState<string>('ALL');

    // Build area mapping
    const getAreaForBranch = (rawBranchString: string): string => {
        if (!companies || companies.length === 0) return 'Geral';
        const company = companies.find(c => c.id === currentUser?.company_id);
        if (!company || !company.areas) return 'Geral';
        
        for (const area of company.areas as CompanyArea[]) {
            for (const b of area.branches) {
                // Try literal match first
                if (b.trim() && rawBranchString.toLowerCase().includes(b.toLowerCase().trim())) {
                    return area.name;
                }
                
                // If the user registered "Filial 1", extract the "1" and map to "F01" or starting digit
                const numMatch = b.match(/\d+/);
                if (numMatch) {
                    const numStr = numMatch[0];
                    const formattedF = 'F' + numStr.padStart(2, '0'); 
                    if (rawBranchString.includes(formattedF) || rawBranchString.startsWith(`${numStr} `) || rawBranchString.startsWith(`${numStr}-`)) {
                        return area.name;
                    }
                }
            }
        }
        return 'Geral'; // fallback
    };

    useEffect(() => {
        const loadAndParseData = async () => {
            try {
                if (!currentUser?.company_id) throw new Error("Empresa não selecionada.");

                const vendasFileMeta = await SupabaseService.fetchGlobalBaseFileFull(currentUser.company_id, 'analysis_vendas_totais');
                const pedidosFileMeta = await SupabaseService.fetchGlobalBaseFileFull(currentUser.company_id, 'analysis_pedidos');

                if (!vendasFileMeta?.file_data_base64) {
                    throw new Error("Arquivo de 'Vendas Totais' não encontrado. Carregue o arquivo em Cadastros Base.");
                }

                // 1. Parse Vendas Totais
                const vendasRes = await fetch(vendasFileMeta.file_data_base64);
                const vendasWb = XLSX.read(await vendasRes.arrayBuffer(), { type: 'array' });
                const vendasSheet = vendasWb.Sheets[vendasWb.SheetNames[0]];
                const vendasRaw: any[] = XLSX.utils.sheet_to_json(vendasSheet, { defval: null });

                const findVal = (row: any, keys: string[]) => {
                    for (const key of Object.keys(row)) {
                        if (keys.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
                            const val = row[key];
                            if (typeof val === 'number') return val;
                            if (typeof val === 'string') {
                                const parsed = parseFloat(val.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.'));
                                return !isNaN(parsed) ? parsed : 0;
                            }
                        }
                    }
                    return 0;
                };

                const findStr = (row: any, keys: string[]) => {
                    for (const key of Object.keys(row)) {
                        if (keys.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
                            return String(row[key] || '').trim();
                        }
                    }
                    return '';
                };

                let parsedVendas: SalesGroupData[] = [];
                let parsedTickets: Record<string, number> = {};
                let currentBranchStr = 'Matriz/Geral';

                vendasRaw.forEach((row) => {
                    const allVals = Object.values(row).map(v => String(v).trim()).filter(v => v);
                    const wholeRowStr = allVals.join(' ');
                    
                    if (wholeRowStr.toLowerCase().includes('filial:') && allVals.length <= 4) {
                        const branchNameMatched = wholeRowStr.split(/filial:/i)[1]?.trim();
                        if (branchNameMatched && branchNameMatched.length > 2) {
                            currentBranchStr = branchNameMatched;
                        }
                        return; // It's just a header row
                    }

                    if (wholeRowStr.toLowerCase().includes('total filial')) {
                        // Extract Venda count (number of tickets) which is usually around column E or "Venda/Devol"
                        for (const key of Object.keys(row)) {
                            const kLow = key.toLowerCase();
                            // Look for 'venda' but ignore 'vlr' or 'total' to avoid grabbing R$ amounts
                            if ((kLow.includes('venda') || kLow.includes('devol') || kLow.includes('código')) && !kLow.includes('vlr') && !kLow.includes('bruto') && !kLow.includes('custo') && !kLow.includes('total')) {
                                const rawVal = String(row[key]);
                                if (rawVal.includes('*') || /^\d+(\.\d{3})*(,\d+)?\*?$/.test(rawVal.trim())) {
                                    const cleaned = parseFloat(rawVal.replace(/[R$\s*]/g, '').replace(/\./g, '').replace(',', '.'));
                                    if (!isNaN(cleaned) && cleaned > 0) {
                                        // Pick the first reasonable large number as the ticket count
                                        parsedTickets[currentBranchStr] = Math.max(parsedTickets[currentBranchStr] || 0, cleaned);
                                    }
                                }
                            }
                        }
                        return;
                    }

                    const gp = findStr(row, ['grupo', 'produto', 'descrição']);
                    if (!gp || gp.toLowerCase().includes('total')) return;

                    const vlrVenda = findVal(row, ['total vlr. venda', 'vlr. venda', 'vlr venda']);
                    const vlrCusto = findVal(row, ['custo']);
                    const rVolVend = findVal(row, ['qtd', 'vend']);
                    const rTicket = findVal(row, ['ticket']);
                    
                    if (rVolVend === 0 && vlrVenda === 0) return; // ignore completely empty groups

                    parsedVendas.push({
                        branchName: currentBranchStr,
                        areaName: getAreaForBranch(currentBranchStr),
                        name: gp,
                        estoque: findVal(row, ['estoque']),
                        volumeVend: rVolVend,
                        vlrCusto: vlrCusto,
                        vlrBruto: findVal(row, ['bruto']),
                        vlrVenda: vlrVenda,
                        ticket: rTicket > 0 ? rTicket : 0,
                        ticketCount: rTicket > 0 ? 1 : 0,
                        rentabilidade: findVal(row, ['% rent', 'rentabilidade'])
                    });
                });

                // Extract unique branches from Vendas to align E-commerce
                const uniqueVendasBranches = Array.from(new Set(parsedVendas.map(v => v.branchName)));

                // 2. Parse E-commerce Pedidos
                let parsedEcom: {branchName: string, valor: number}[] = [];
                if (pedidosFileMeta?.file_data_base64) {
                    try {
                        const pedRes = await fetch(pedidosFileMeta.file_data_base64);
                        const pedWb = XLSX.read(await pedRes.arrayBuffer(), { type: 'array' });
                        const pedSheet = pedWb.Sheets[pedWb.SheetNames[0]];
                        const pedRaw: any[] = XLSX.utils.sheet_to_json(pedSheet, { defval: null });

                        pedRaw.forEach(row => {
                            // Varre a linha inteira para pegar status de Cancelado (como na Coluna L relatada)
                            const fullRowText = Object.values(row).join(' ').toLowerCase();
                            if (fullRowText.includes('cancelado') || fullRowText.includes('devolvido')) return;

                            // A coluna B é a segunda propriedade do objeto lido
                            const bNameValues = Object.values(row);
                            const bNameRaw = String(bNameValues[1] || '').trim(); 
                            
                            // Adicionando 'valor', 'pago' para aumentar a chance de catar o total
                            const val = findVal(row, ['faturamento', 'líquido', 'liquido', 'valor', 'total', 'venda', 'pedido', 'pago']); 
                            
                            let finalBranch = 'E-commerce Geral';
                            if (bNameRaw) {
                                // O usuário reportou que B é "um número bem simples", ex: 1, 2, 3
                                // Nossa Matriz tem filiais como "F01", "F02", etc.
                                const numericBranch = bNameRaw.replace(/\D/g, ''); // Garante só os números
                                const formattedF = numericBranch ? 'F' + numericBranch.padStart(2, '0') : bNameRaw; 
                                
                                const matched = uniqueVendasBranches.find(vb => 
                                    vb.includes(formattedF) || 
                                    vb.startsWith(`${numericBranch} `)
                                );
                                
                                if (matched) finalBranch = matched;
                                // Caso não ache, pelo menos mostra onde parou para debug na string finalBranch
                                else finalBranch = `Filial E-com [${bNameRaw}]`; 
                            }

                            if (val > 0) {
                                parsedEcom.push({
                                    branchName: finalBranch,
                                    valor: val
                                });
                            }
                        });
                    } catch (err) {
                        console.warn("Erro ao parsear arquivo ecom", err);
                    }
                }

                setRawState({
                    loading: false,
                    error: null,
                    rawLinesVendas: parsedVendas,
                    rawLinesEcom: parsedEcom,
                    rawBranchTickets: parsedTickets
                });

            } catch (err: any) {
                setRawState(prev => ({ ...prev, loading: false, error: err.message || "Erro desconhecido ao carregar planilhas." }));
            }
        };

        loadAndParseData();
    }, [currentUser?.company_id, companies]);

    // Data Engine calculations based on filters
    const filteredData = useMemo(() => {
        let filteredVendas = rawState.rawLinesVendas;
        let filteredEcom = rawState.rawLinesEcom;

        if (selectedArea !== 'ALL') {
            filteredVendas = filteredVendas.filter(r => r.areaName === selectedArea);
            filteredEcom = filteredEcom.filter(r => getAreaForBranch(r.branchName) === selectedArea);
        }

        if (selectedBranch !== 'ALL') {
            filteredVendas = filteredVendas.filter(r => r.branchName === selectedBranch);
            filteredEcom = filteredEcom.filter(r => r.branchName === selectedBranch);
        }

        let fFat = 0;
        let fCust = 0;
        let fVol = 0;
        let tktSum = 0;
        let tktQtd = 0;

        // aglutinar grupos independentemente de filial se selecionado multiplas
        const aglutinadoMap = new Map<string, SalesGroupData>();

        filteredVendas.forEach(r => {
            fFat += r.vlrVenda;
            fCust += r.vlrCusto;
            fVol += r.volumeVend;
            if (r.ticket > 0) {
                tktSum += r.ticket;
                tktQtd += r.ticketCount;
            }

            const exist = aglutinadoMap.get(r.name);
            if (exist) {
                exist.estoque += r.estoque;
                exist.volumeVend += r.volumeVend;
                exist.vlrVenda += r.vlrVenda;
                exist.vlrCusto += r.vlrCusto;
            } else {
                aglutinadoMap.set(r.name, { ...r });
            }
        });

        const ecomTotal = filteredEcom.reduce((acc, curr) => acc + curr.valor, 0);
        
        let grouped = Array.from(aglutinadoMap.values()).map(g => {
            // recalcular rentabilidade do grupo unificado
            g.rentabilidade = g.vlrVenda > 0 ? ((g.vlrVenda - g.vlrCusto) / g.vlrVenda) * 100 : 0;
            return g;
        });

        grouped.sort((a,b) => b.vlrVenda - a.vlrVenda);

        const avgRent = fFat > 0 ? ((fFat - fCust) / fFat) * 100 : 0;
        
        let totalOperacoes = 0;
        const validBranchesForTickets = new Set(filteredVendas.map(v => v.branchName));
        validBranchesForTickets.forEach(b => {
             if (rawState.rawBranchTickets[b]) totalOperacoes += rawState.rawBranchTickets[b];
        });

        const avgTkt = totalOperacoes > 0 ? (fFat / totalOperacoes) : 0;
        const ecomShare = fFat > 0 ? (ecomTotal / fFat) * 100 : 0;

        let finalGrouped = grouped.map(g => {
            g.participacao = fFat > 0 ? (g.vlrVenda / fFat) * 100 : 0;
            return g;
        });

        return {
            faturamentoLiq: fFat,
            ticketMedioGeral: avgTkt,
            lucratividadeMedia: avgRent,
            volumeTotal: fVol,
            ecomTotal,
            ecomShare,
            grupos: finalGrouped
        };
    }, [rawState, selectedArea, selectedBranch]);

    // Unique lists for selectors, using natural string sort so "10" comes after "2"
    const avaliableAreas = useMemo(() => {
        return Array.from(new Set(rawState.rawLinesVendas.map(r => r.areaName)))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    }, [rawState.rawLinesVendas]);
    
    const avaliableBranches = useMemo(() => {
        let base = rawState.rawLinesVendas;
        if (selectedArea !== 'ALL') base = base.filter(r => r.areaName === selectedArea);
        return Array.from(new Set(base.map(r => r.branchName)))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    }, [rawState.rawLinesVendas, selectedArea]);

    const formatBRL = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    const formatPercent = (val: number) => val.toFixed(2) + '%';
    const formatNumber = (val: number) => new Intl.NumberFormat('pt-BR').format(val);

    const COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#64748b', '#1dd1a1'];

    if (rawState.loading) return (
        <div className="flex flex-col items-center justify-center p-24 text-gray-400">
            <Loader2 size={48} className="animate-spin mb-4" />
            <p className="font-bold text-gray-500">Mapeando Matriz, Filiais e Áreas...</p>
        </div>
    );

    if (rawState.error) return (
        <div className="bg-rose-50 border border-rose-200 rounded-3xl p-10 flex flex-col items-center text-center">
            <Activity size={48} className="text-rose-500 mb-4" />
            <h3 className="text-xl font-black text-rose-800">Sem Dados de Origem</h3>
            <p className="text-rose-600 mt-2 max-w-xl">{rawState.error}</p>
        </div>
    );

    const top5Revenue = filteredData.grupos.slice(0, 5);
    const top5Volume = [...filteredData.grupos].sort((a,b) => b.volumeVend - a.volumeVend).slice(0, 5);

    return (
        <div className="space-y-6">
            
            {/* Filter Hub */}
            <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-gray-200 p-4 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="flex items-center gap-2 text-gray-600">
                    <Filter size={18} />
                    <span className="font-bold text-sm tracking-wide">Filtros Gerenciais</span>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
                    <div className="flex-1 sm:flex-none flex items-center bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 focus-within:ring-2 ring-indigo-100 transition-shadow">
                        <MapPin size={14} className="text-indigo-400 mr-2" />
                        <select 
                            className="bg-transparent border-none text-sm font-bold text-gray-700 outline-none pr-4 w-full cursor-pointer appearance-none"
                            value={selectedArea}
                            onChange={(e) => {
                                setSelectedArea(e.target.value);
                                setSelectedBranch('ALL');
                            }}
                        >
                            <option value="ALL">Todas as Áreas (Total Empresa)</option>
                            {avaliableAreas.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </div>

                    <div className="flex-1 sm:flex-none flex items-center bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 focus-within:ring-2 ring-blue-100 transition-shadow">
                        <Building2 size={14} className="text-blue-400 mr-2" />
                        <select 
                            className="bg-transparent border-none text-sm font-bold text-gray-700 outline-none pr-4 max-w-[200px] cursor-pointer appearance-none"
                            value={selectedBranch}
                            onChange={(e) => setSelectedBranch(e.target.value)}
                        >
                            <option value="ALL">Todas as Filiais {selectedArea !== 'ALL' && 'da Área'}</option>
                            {avaliableBranches.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center opacity-50 group-hover:scale-110 transition-transform"><DollarSign size={40} className="text-blue-200" /></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Fat. Líquido ({selectedArea==='ALL' && selectedBranch==='ALL' ? 'Rede' : 'Filtro'})</p>
                    <h3 className="text-2xl font-black text-gray-900">{formatBRL(filteredData.faturamentoLiq)}</h3>
                    <p className="text-xs text-emerald-500 font-bold mt-2 flex items-center gap-1"><TrendingUp size={12}/> Vol: {formatNumber(filteredData.volumeTotal)} und</p>
                </div>

                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center opacity-50 group-hover:scale-110 transition-transform"><Target size={40} className="text-indigo-200" /></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Ticket Médio (Global)</p>
                    <h3 className="text-2xl font-black text-gray-900">{formatBRL(filteredData.ticketMedioGeral)}</h3>
                    <p className="text-xs text-gray-400 font-bold mt-2">Média com base no fluxo</p>
                </div>

                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center opacity-50 group-hover:scale-110 transition-transform"><Activity size={40} className="text-emerald-200" /></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Rentabilidade / Lucro</p>
                    <h3 className="text-2xl font-black text-emerald-600">{formatPercent(filteredData.lucratividadeMedia)}</h3>
                    <p className="text-xs text-rose-500 font-bold mt-2">CMV: {formatPercent(100 - filteredData.lucratividadeMedia)}</p>
                </div>

                <div className="bg-gray-900 rounded-3xl p-6 shadow-sm relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/5 rounded-full flex items-center justify-center opacity-50 group-hover:scale-110 transition-transform"><MonitorSmartphone size={40} className="text-gray-700" /></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">E-Commerce & Digital</p>
                    <h3 className="text-2xl font-black text-white">{formatPercent(filteredData.ecomShare)} <span className="text-sm text-gray-400 font-medium">Share</span></h3>
                    <p className="text-xs text-gray-500 font-bold mt-2 flex items-center gap-1"><Package size={12}/> Vendas Pedidos: {formatBRL(filteredData.ecomTotal)}</p>
                </div>
            </div>

            {/* Matrix / Deep Drill Table */}
            <div className="bg-white border border-gray-100 rounded-[28px] shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
                    <div>
                        <h3 className="text-lg font-black text-gray-900">Performance por Agrupamentos</h3>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                            Mostrando {filteredData.grupos.length} grupos ({selectedBranch !== 'ALL' ? selectedBranch : 'Todas as Filiais'})
                        </p>
                    </div>
                </div>
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-10">
                            <tr className="bg-white/90 backdrop-blur-md border-b border-gray-200 text-[10px] font-black tracking-widest uppercase text-gray-400 shadow-sm">
                                <th className="py-4 px-6 font-bold">Grupo</th>
                                <th className="py-4 px-6 font-bold text-right">Estoque Disp.</th>
                                <th className="py-4 px-6 font-bold text-right">Vol (Giro)</th>
                                <th className="py-4 px-6 font-bold text-right">Receita Líquida</th>
                                <th className="py-4 px-6 font-bold text-right">Particip. (%)</th>
                                <th className="py-4 px-6 font-bold text-right">Rent. (%)</th>
                                <th className="py-4 px-6 font-bold text-right">CMV (%)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filteredData.grupos.map((g, idx) => (
                                <tr key={idx} className="hover:bg-indigo-50/30 transition-colors">
                                    <td className="py-3 px-6 text-sm font-bold text-gray-900">{g.name}</td>
                                    <td className="py-3 px-6 text-sm font-medium text-gray-600 text-right">{formatNumber(g.estoque)}</td>
                                    <td className="py-3 px-6 text-sm font-medium text-indigo-600 text-right">{formatNumber(g.volumeVend)}</td>
                                    <td className="py-3 px-6 text-sm font-black text-emerald-600 text-right">{formatBRL(g.vlrVenda)}</td>
                                    <td className="py-3 px-6 text-sm font-bold text-blue-600 text-right bg-blue-50/20">{formatPercent(g.participacao || 0)}</td>
                                    <td className="py-3 px-6 text-sm font-bold text-right text-gray-700">
                                        <div className="flex items-center justify-end gap-2">
                                            <div className="w-16 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                                <div className={`h-full rounded-full ${g.rentabilidade > 20 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{width: `${Math.min(100, Math.max(0, g.rentabilidade))}%`}}></div>
                                            </div>
                                            <span className="w-12">{formatPercent(g.rentabilidade)}</span>
                                        </div>
                                    </td>
                                    <td className="py-3 px-6 text-sm font-black text-rose-600 text-right bg-rose-50/20">{formatPercent(100 - g.rentabilidade)}</td>
                                </tr>
                            ))}
                            {filteredData.grupos.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="py-12 text-center text-gray-500 font-bold">Nenhum dado encontrado para esse filtro.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

        </div>
    );
};

export default AnaliseDashboard;
