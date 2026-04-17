import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, 
    PieChart, Pie, Cell 
} from 'recharts';
import { Loader2, DollarSign, Target, Activity, MonitorSmartphone, Package, TrendingUp, Filter, MapPin, Building2, Sparkles, Camera } from 'lucide-react';
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
    devolucoes: number;
}

interface RawDataState {
    loading: boolean;
    error: string | null;
    rawLinesVendas: SalesGroupData[];
    rawLinesEcom: { branchName: string, valor: number }[];
    rawBranchTickets: Record<string, number>;
}

export const AnaliseDashboard: React.FC<AnaliseDashboardProps> = ({ currentUser, companies = [] }) => {
    const dashboardRef = useRef<HTMLDivElement>(null);
    const [isExporting, setIsExporting] = useState(false);

    const [rawState, setRawState] = useState<RawDataState>({
        loading: true,
        error: null,
        rawLinesVendas: [],
        rawLinesEcom: [],
        rawBranchTickets: {}
    });

    const [selectedArea, setSelectedArea] = useState<string>('ALL');
    const [selectedCity, setSelectedCity] = useState<string>('ALL');
    const [selectedBranch, setSelectedBranch] = useState<string>('ALL');

    const takeSnapshot = async () => {
        if (!dashboardRef.current) return;
        setIsExporting(true);
        try {
            await new Promise(r => setTimeout(r, 100)); // allow render frame
            const canvas = await html2canvas(dashboardRef.current, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#f8fafc',
            });
            const image = canvas.toDataURL("image/png");
            const link = document.createElement("a");
            link.href = image;
            link.download = `RaioX_${selectedArea}_${new Date().toISOString().split('T')[0]}.png`;
            link.click();
        } catch (error) {
            console.error("Error generating snapshot", error);
        } finally {
            setIsExporting(false);
        }
    };

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
                const vendasRawAOA: any[] = XLSX.utils.sheet_to_json(vendasSheet, { header: 'A', defval: null });

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

                const findValExclude = (row: any, includeKeys: string[], excludeKeys: string[]) => {
                    for (const key of Object.keys(row)) {
                        const kLow = key.toLowerCase();
                        if (includeKeys.some(k => kLow.includes(k.toLowerCase())) && !excludeKeys.some(k => kLow.includes(k.toLowerCase()))) {
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
                let rawBranchTickets: Record<string, {tkt: number, count: number}> = {};
                let rawBranchDevols: Record<string, number> = {};
                let currentBranchStr = 'Matriz/Geral';

                vendasRaw.forEach((row, idx) => {
                    const rowAOA = vendasRawAOA[idx + 1] || {};
                    const rawFValue = rowAOA['F'] ?? rowAOA['f'];

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
                        // Extract global Branch Returns from exact Column F string mapped previously
                        let totalBrDevol = 0;
                        if (typeof rawFValue === 'number') totalBrDevol = Math.abs(rawFValue);
                        else if (typeof rawFValue === 'string') {
                            const parsed = parseFloat(rawFValue.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.'));
                            if (!isNaN(parsed)) totalBrDevol = Math.abs(parsed);
                        }
                        rawBranchDevols[currentBranchStr] = totalBrDevol;

                        // Extract Venda count (number of tickets) which is usually around column E or "Venda/Devol"
                        for (const key of Object.keys(row)) {
                            const kLow = key.toLowerCase();
                            // Look for 'venda' but ignore 'vlr' or 'total' to avoid grabbing R$ amounts
                            if ((kLow.includes('venda') || kLow.includes('devol') || kLow.includes('código')) && !kLow.includes('vlr') && !kLow.includes('bruto') && !kLow.includes('custo') && !kLow.includes('total')) {
                                const rawVal = String(row[key]);
                                if (rawVal.includes('*') || /^\d+(\.\d{3})*(,\d+)?\*?$/.test(rawVal.trim())) {
                                    const cleaned = parseFloat(rawVal.replace(/[R$\s*]/g, '').replace(/\./g, '').replace(',', '.'));
                                    if (!isNaN(cleaned) && cleaned > 0) {
                                        const prev = rawBranchTickets[currentBranchStr] ? rawBranchTickets[currentBranchStr].tkt : 0;
                                        rawBranchTickets[currentBranchStr] = {
                                            tkt: Math.max(prev, cleaned),
                                            count: 1
                                        };
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
                        rentabilidade: findVal(row, ['% rent', 'rentabilidade']),
                        devolucoes: 0 // Retorno está sendo lido da matriz/filial e não por grupo
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
                    rawBranchTickets: rawBranchTickets,
                    rawBranchDevols: rawBranchDevols
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

        if (selectedCity !== 'ALL') {
            const cityNormalized = selectedCity.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const cityMatch = (bName: string) => {
                const upper = bName.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                return upper.includes(cityNormalized) || 
                    (selectedCity === 'SÃO GABRIEL' && upper.includes('MATRIZ'));
            };
                
            filteredVendas = filteredVendas.filter(r => cityMatch(r.branchName));
            filteredEcom = filteredEcom.filter(r => cityMatch(r.branchName));
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

        // Compute total devol based ONLY on visible branches 'Total Filial' mapping
        const visibleBranches = new Set(filteredVendas.map(r => r.branchName));
        let totalDevol = 0;
        visibleBranches.forEach(b => {
             totalDevol += ((rawState as any).rawBranchDevols?.[b] || 0);
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
             const tb = rawState.rawBranchTickets[b];
             if (tb) totalOperacoes += tb.tkt; // Acessa a propriedade contendo o núm de cupons (Coluna E)
        });

        const operacoesLiquidas = totalOperacoes - totalDevol; // Abate Devoluções (F) do Fluxo/Vendas (E)
        const avgTkt = operacoesLiquidas > 0 ? (fFat / operacoesLiquidas) : 0;
        const ecomShare = fFat > 0 ? (ecomTotal / fFat) * 100 : 0;

        let finalGrouped = grouped.map(g => {
            g.participacao = fFat > 0 ? (g.vlrVenda / fFat) * 100 : 0;
            return g;
        });

        const isHB = (name: string) => {
            const n = name.trim().toUpperCase();
            return n === 'HB' || n.includes('HIGIENE') || n.includes('PERFUMARIA') || n.includes('COSMÉTIC') || n.includes('COSMETIC') || n.includes('BELEZA') || n === 'H.B.' || n === 'H.B';
        };
        
        const hbTotal = finalGrouped.filter(g => isHB(g.name)).reduce((acc, g) => acc + g.vlrVenda, 0);
        const hbShare = fFat > 0 ? (hbTotal / fFat) * 100 : 0;

        // Consolidar performance absoluta por Filial para a tabela secundária
        const filiaisMap = new Map<string, any>();
        filteredVendas.forEach(r => {
            const bName = r.branchName;
            if (!filiaisMap.has(bName)) {
                filiaisMap.set(bName, {
                    branchName: bName,
                    vlrVenda: 0,
                    vlrCusto: 0,
                    volumeVend: 0,
                    hbTotal: 0,
                });
            }
            const exist = filiaisMap.get(bName);
            exist.vlrVenda += r.vlrVenda;
            exist.vlrCusto += r.vlrCusto;
            exist.volumeVend += r.volumeVend;
            if (isHB(r.name)) exist.hbTotal += r.vlrVenda;
        });

        const filiaisPerformance = Array.from(filiaisMap.values()).map(b => {
             const bDevol = ((rawState as any).rawBranchDevols?.[b.branchName] || 0);
             const bt = rawState.rawBranchTickets[b.branchName];
             const bTkts = bt ? bt.tkt : 0;
             const opLiq = bTkts - bDevol;
             const avgTkt = opLiq > 0 ? (b.vlrVenda / opLiq) : 0;
             const rent = b.vlrVenda > 0 ? ((b.vlrVenda - b.vlrCusto) / b.vlrVenda) * 100 : 0;
             const participacao = fFat > 0 ? (b.vlrVenda / fFat) * 100 : 0;
             const hbShareLoc = b.vlrVenda > 0 ? (b.hbTotal / b.vlrVenda) * 100 : 0;
             const ecomSalesLoc = filteredEcom.filter(e => e.branchName === b.branchName).reduce((a,c) => a + c.valor, 0);
             const ecomShareLocal = b.vlrVenda > 0 ? (ecomSalesLoc / b.vlrVenda) * 100 : 0;

             return {
                 ...b,
                 devolucoes: bDevol,
                 ticketMedio: avgTkt,
                 rentabilidade: rent,
                 participacao,
                 hbShare: hbShareLoc,
                 ecomTotalLoc: ecomSalesLoc,
                 ecomShareLoc: ecomShareLocal
             };
        });
        filiaisPerformance.sort((a,b) => a.branchName.localeCompare(b.branchName, undefined, { numeric: true, sensitivity: 'base' }));

        return {
            faturamentoLiq: fFat,
            ticketMedioGeral: avgTkt,
            lucratividadeMedia: avgRent,
            volumeTotal: fVol,
            totalDevol,
            ecomTotal,
            ecomShare,
            hbTotal,
            hbShare,
            grupos: finalGrouped,
            filiais: filiaisPerformance
        };
    }, [rawState, selectedArea, selectedCity, selectedBranch]);

    // Unique lists for selectors, using natural string sort so "10" comes after "2"
    const avaliableAreas = useMemo(() => {
        return Array.from(new Set(rawState.rawLinesVendas.map(r => r.areaName)))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    }, [rawState.rawLinesVendas]);

    const avaliableCities = useMemo(() => {
        let base = rawState.rawLinesVendas;
        if (selectedArea !== 'ALL') base = base.filter(r => r.areaName === selectedArea);
        
        const cities = new Set<string>();
        base.forEach(r => {
            const upperName = r.branchName.toUpperCase();
            if (upperName.includes('MATRIZ')) {
                cities.add('SÃO GABRIEL');
            }
            const parts = r.branchName.split('-');
            if (parts.length > 1) {
                let city = parts[1].replace(/[\d\.\/]+.*$/, '').trim().toUpperCase();
                // Força unificação de acentos comuns
                if (city === 'SAO GABRIEL' || city === 'SÃO GABRIEL') city = 'SÃO GABRIEL';
                if (city && city.length > 2) cities.add(city);
            }
        });
        return Array.from(cities).sort((a, b) => a.localeCompare(b));
    }, [rawState.rawLinesVendas, selectedArea]);
    
    const avaliableBranches = useMemo(() => {
        let base = rawState.rawLinesVendas;
        if (selectedArea !== 'ALL') base = base.filter(r => r.areaName === selectedArea);
        if (selectedCity !== 'ALL') {
            const cityNormalized = selectedCity.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            base = base.filter(r => {
                const upper = r.branchName.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                return upper.includes(cityNormalized) || 
                       (selectedCity === 'SÃO GABRIEL' && upper.includes('MATRIZ'));
            });
        }
        return Array.from(new Set(base.map(r => r.branchName)))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    }, [rawState.rawLinesVendas, selectedArea, selectedCity]);

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
        <div className="space-y-6 bg-slate-50 p-4 -m-4 rounded-xl w-full mx-auto" ref={dashboardRef}>
            
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
                                setSelectedCity('ALL');
                                setSelectedBranch('ALL');
                            }}
                        >
                            <option value="ALL">Todas as Áreas (Total Empresa)</option>
                            {avaliableAreas.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </div>

                    <div className="flex-1 sm:flex-none flex items-center bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 focus-within:ring-2 ring-cyan-100 transition-shadow">
                        <MapPin size={14} className="text-cyan-500 mr-2" />
                        <select 
                            className="bg-transparent border-none text-sm font-bold text-gray-700 outline-none pr-4 w-full cursor-pointer appearance-none"
                            value={selectedCity}
                            onChange={(e) => {
                                setSelectedCity(e.target.value);
                                setSelectedBranch('ALL');
                            }}
                        >
                            <option value="ALL">Todas as Cidades</option>
                            {avaliableCities.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>

                    <div className="flex-1 sm:flex-none flex items-center bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 focus-within:ring-2 ring-blue-100 transition-shadow">
                        <Building2 size={14} className="text-blue-400 mr-2" />
                        <select 
                            className="bg-transparent border-none text-sm font-bold text-gray-700 outline-none pr-4 max-w-[200px] cursor-pointer appearance-none"
                            value={selectedBranch}
                            onChange={(e) => setSelectedBranch(e.target.value)}
                        >
                            <option value="ALL">Todas as Filiais</option>
                            {avaliableBranches.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                    </div>

                    {/* Snapshot Print Button */}
                    <button 
                        onClick={takeSnapshot}
                        disabled={isExporting}
                        className="flex-none flex items-center justify-center gap-2 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-bold py-1.5 px-4 rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50"
                    >
                        {isExporting ? <Loader2 size={16} className="animate-spin"/> : <Camera size={16} />}
                        <span className="text-sm whitespace-nowrap">{isExporting ? 'Processando...' : 'Screenshot'}</span>
                    </button>
                    
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm relative overflow-hidden group hover:shadow-blue-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-default">
                    <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center opacity-50 group-hover:scale-125 group-hover:bg-blue-100 transition-all duration-500"><DollarSign size={40} className="text-blue-300 group-hover:text-blue-500 transition-colors" /></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1 group-hover:text-blue-500 transition-colors">Fat. Líquido ({selectedArea==='ALL' && selectedBranch==='ALL' ? 'Rede' : 'Filtro'})</p>
                    <h3 className="text-lg xl:text-lg 2xl:text-xl font-black text-gray-900 whitespace-nowrap tracking-tighter" title={formatBRL(filteredData.faturamentoLiq)}>{formatBRL(filteredData.faturamentoLiq)}</h3>
                    <div className="flex items-center gap-3 mt-2 relative z-10">
                        <p className="text-xs text-emerald-500 font-bold flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-md"><TrendingUp size={12}/> Vol: {formatNumber(filteredData.volumeTotal)}</p>
                        <p className="text-xs text-rose-500 font-bold flex items-center gap-1 bg-rose-50 px-2 py-0.5 rounded-md">Dev: {formatNumber(filteredData.totalDevol)}</p>
                    </div>
                </div>

                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm relative overflow-hidden group hover:shadow-indigo-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-default">
                    <div className="absolute -right-4 -top-4 w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center opacity-50 group-hover:scale-125 group-hover:bg-indigo-100 transition-all duration-500"><Target size={40} className="text-indigo-300 group-hover:text-indigo-500 transition-colors" /></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1 group-hover:text-indigo-500 transition-colors">Ticket Médio (Global)</p>
                    <h3 className="text-lg xl:text-lg 2xl:text-xl font-black text-gray-900 whitespace-nowrap tracking-tighter">{formatBRL(filteredData.ticketMedioGeral)}</h3>
                    <p className="text-xs text-indigo-500 font-bold mt-2 bg-indigo-50 px-2 py-0.5 rounded-md inline-block relative z-10">Média c/ devoluções embutidas</p>
                </div>

                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm relative overflow-hidden group hover:shadow-pink-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-default">
                    <div className="absolute -right-4 -top-4 w-24 h-24 bg-pink-50 rounded-full flex items-center justify-center opacity-50 group-hover:scale-125 group-hover:bg-pink-100 transition-all duration-500"><Sparkles size={40} className="text-pink-300 group-hover:text-pink-500 transition-colors" /></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1 group-hover:text-pink-500 transition-colors">Categoria HB</p>
                    <h3 className="text-lg xl:text-lg 2xl:text-xl font-black text-gray-900 whitespace-nowrap tracking-tighter" title={formatBRL(filteredData.hbTotal)}>{formatBRL(filteredData.hbTotal)}</h3>
                    <p className="text-xs text-pink-600 font-bold mt-2 bg-pink-50 px-2 py-0.5 rounded-md inline-flex items-center gap-1 relative z-10">{formatPercent(filteredData.hbShare)} Share</p>
                </div>

                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm relative overflow-hidden group hover:shadow-emerald-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-default">
                    <div className="absolute -right-4 -top-4 w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center opacity-50 group-hover:scale-125 group-hover:bg-emerald-100 transition-all duration-500"><Activity size={40} className="text-emerald-300 group-hover:text-emerald-500 transition-colors" /></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1 group-hover:text-emerald-500 transition-colors">Rentabilidade / Lucro</p>
                    <h3 className="text-lg xl:text-lg 2xl:text-xl font-black text-emerald-600 whitespace-nowrap tracking-tighter">{formatPercent(filteredData.lucratividadeMedia)}</h3>
                    <p className="text-xs text-rose-500 font-bold mt-2 bg-rose-50 px-2 py-0.5 rounded-md inline-block relative z-10">CMV: {formatPercent(100 - filteredData.lucratividadeMedia)}</p>
                </div>

                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm relative overflow-hidden group hover:shadow-cyan-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-default">
                    <div className="absolute -right-4 -top-4 w-24 h-24 bg-cyan-50 rounded-full flex items-center justify-center opacity-50 group-hover:scale-125 group-hover:bg-cyan-100 transition-all duration-500"><MonitorSmartphone size={40} className="text-cyan-300 group-hover:text-cyan-500 transition-colors" /></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1 group-hover:text-cyan-500 transition-colors">E-Commerce & Digital</p>
                    <h3 className="text-lg xl:text-lg 2xl:text-xl font-black text-gray-900 whitespace-nowrap tracking-tighter">{formatPercent(filteredData.ecomShare)} <span className="text-sm font-bold text-slate-400">Share</span></h3>
                    <p className="text-xs text-cyan-600 font-bold mt-2 bg-cyan-50 px-2 py-0.5 rounded-md inline-flex items-center gap-1 relative z-10"><Package size={12}/> Vendas Pedidos: {formatBRL(filteredData.ecomTotal)}</p>
                </div>
            </div>

            {/* Tabela de Performance por Filial (Always visible) */}
            <div className="bg-white border border-gray-100 rounded-[28px] shadow-sm overflow-hidden mb-6 relative group transition-all duration-300 hover:shadow-xl">
                <div className="p-6 border-b border-gray-50 flex justify-between items-center relative z-10 bg-gray-50/50">
                    <div>
                        <h3 className="text-xl font-black text-gray-900 flex items-center gap-3">
                            <Building2 size={24} className="text-indigo-500" />
                            Raio-X por Filial
                        </h3>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">
                            Comparativo matriz das lojas {selectedArea !== 'ALL' ? `da ${selectedArea}` : 'de toda a rede'}
                        </p>
                    </div>
                </div>
                <div className="relative z-10 custom-scrollbar transition-all duration-300 overflow-visible w-full min-w-full">
                    <table className="w-full text-left border-collapse min-w-[700px]">
                        <thead className="sticky top-0 z-10">
                            <tr className="bg-white/90 backdrop-blur-md border-b border-gray-200 text-[10px] font-black tracking-widest uppercase text-gray-400 shadow-sm">
                                <th className="py-4 px-6 font-bold whitespace-nowrap">Filial</th>
                                <th className="py-4 px-6 font-bold text-right whitespace-nowrap">Fat. Líquido</th>
                                <th className="py-4 px-6 font-bold text-right whitespace-nowrap">Tkt Médio (Líq)</th>
                                <th className="py-4 px-6 font-bold text-right whitespace-nowrap">CMV (%)</th>
                                <th className="py-4 px-6 font-bold text-right whitespace-nowrap">Share HB (%)</th>
                                <th className="py-4 px-6 font-bold text-right border-x border-gray-100 bg-gray-50/50 whitespace-nowrap">E-Commerce</th>
                                <th className="py-4 px-6 font-bold text-right whitespace-nowrap">Particip. (%)</th>
                                <th className="py-4 px-6 font-bold text-right whitespace-nowrap">Rent. (%)</th>
                                <th className="py-4 px-6 font-bold text-right whitespace-nowrap">Devol.</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filteredData.filiais.map((f: any, idx: number) => (
                                <tr key={idx} className="hover:bg-indigo-50/30 transition-colors">
                                    <td className="py-3 px-6 text-sm font-bold text-gray-900 whitespace-nowrap">{f.branchName}</td>
                                    <td className="py-3 px-6 text-sm font-black text-emerald-600 text-right whitespace-nowrap">{formatBRL(f.vlrVenda)}</td>
                                    <td className="py-3 px-6 text-sm font-bold text-indigo-600 text-right whitespace-nowrap">{formatBRL(f.ticketMedio)}</td>
                                    <td className="py-3 px-6 text-sm font-bold text-rose-600 text-right whitespace-nowrap bg-rose-50/20">{formatPercent(100 - f.rentabilidade)}</td>
                                    <td className="py-3 px-6 text-sm font-bold text-pink-600 text-right whitespace-nowrap bg-pink-50/20">{formatPercent(f.hbShare)}</td>
                                    <td className="py-2 px-6 text-sm font-black text-cyan-700 text-right border-x border-gray-100 bg-cyan-50/30 whitespace-nowrap">
                                        <div className="flex flex-col items-end leading-tight">
                                            <span>{formatBRL(f.ecomTotalLoc)}</span>
                                            <span className="text-[11px] font-black text-cyan-600 bg-cyan-100/50 px-2 py-0.5 rounded mt-1 border border-cyan-200/50">{formatPercent(f.ecomShareLoc)} Share</span>
                                        </div>
                                    </td>
                                    <td className="py-3 px-6 text-sm font-bold text-blue-600 text-right whitespace-nowrap bg-blue-50/20">{formatPercent(f.participacao)}</td>
                                    <td className="py-3 px-6 text-sm font-medium text-right text-gray-700 min-w-[140px] whitespace-nowrap">
                                        <div className="flex items-center justify-end gap-2">
                                            <div className="w-16 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                                <div className={`h-full rounded-full ${f.rentabilidade > 30 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{width: `${Math.min(100, Math.max(0, f.rentabilidade))}%`}}></div>
                                            </div>
                                            <span className="w-12">{formatPercent(f.rentabilidade)}</span>
                                        </div>
                                    </td>
                                    <td className="py-3 px-6 text-sm font-bold text-rose-500 text-right whitespace-nowrap bg-rose-50/20">{formatNumber(f.devolucoes)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Matrix / Deep Drill Table */}
            <div className="bg-white border border-gray-100 rounded-[28px] shadow-sm overflow-hidden mt-8" data-html2canvas-ignore="true">
                <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
                    <div>
                        <h3 className="text-lg font-black text-gray-900">Performance por Agrupamentos</h3>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                            Mostrando {filteredData.grupos.length} grupos ({selectedBranch !== 'ALL' ? selectedBranch : 'Todas as Filiais'})
                        </p>
                    </div>
                </div>
                <div className="transition-all duration-300 overflow-visible w-full min-w-full">
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
