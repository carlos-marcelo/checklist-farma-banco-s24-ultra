import sys

filepath = 'components/AnaliseResultados/AnaliseDashboard.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update interface RawDataState
old_interface = """interface RawDataState {
    loading: boolean;
    error: string | null;
    rawLinesVendas: SalesGroupData[];
    rawLinesEcom: { branchName: string, valor: number }[];
    rawBranchTickets: Record<string, number>;
}"""
new_interface = """interface RawDataState {
    loading: boolean;
    error: string | null;
    rawLinesVendas: SalesGroupData[];
    rawLinesEcom: { branchName: string, valor: number }[];
    rawBranchTickets: Record<string, number>;
    rawBranchDevols?: Record<string, number>;
    vendasUpdatedAt?: string;
}

const formatDateToBr = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', {hour12: false});
    } catch {
        return '';
    }
};"""

if old_interface in content:
    content = content.replace(old_interface, new_interface)
else:
    print("Could not find old interface.")

# 2. Update setRawState
old_setstate = """                setRawState({
                    loading: false,
                    error: null,
                    rawLinesVendas: parsedVendas,
                    rawLinesEcom: parsedEcom,
                    rawBranchTickets: rawBranchTickets,
                    rawBranchDevols: rawBranchDevols
                });"""
new_setstate = """                setRawState({
                    loading: false,
                    error: null,
                    rawLinesVendas: parsedVendas,
                    rawLinesEcom: parsedEcom,
                    rawBranchTickets: rawBranchTickets,
                    rawBranchDevols: rawBranchDevols,
                    vendasUpdatedAt: String(vendasFileMeta.updated_at || vendasFileMeta.created_at || '')
                });"""

if old_setstate in content:
    content = content.replace(old_setstate, new_setstate)
else:
    print("Could not find setRawState.")

# 3. Update the Raio-X por Filial header
old_header = """                                    <div>
                                        <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
                                            <Building2 size={24} className="text-indigo-600" />
                                            Raio-X por Filial
                                        </h3>
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">
                                            Comparativo matriz das lojas {selectedArea !== 'ALL' ? `da ${selectedArea}` : 'de toda a rede'}
                                        </p>
                                    </div>
                                </div>"""
new_header = """                                    <div>
                                        <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
                                            <Building2 size={24} className="text-indigo-600" />
                                            Raio-X por Filial
                                        </h3>
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">
                                            Comparativo matriz das lojas {selectedArea !== 'ALL' ? `da ${selectedArea}` : 'de toda a rede'}
                                        </p>
                                    </div>
                                    {rawState.vendasUpdatedAt && (
                                        <div className="flex flex-col items-end border border-gray-200 bg-white/60 backdrop-blur rounded-xl px-4 py-2 shadow-sm">
                                            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Atualizado em</span>
                                            <span className="text-sm font-bold text-gray-700">{formatDateToBr(rawState.vendasUpdatedAt)}</span>
                                        </div>
                                    )}
                                </div>"""

if old_header in content:
    content = content.replace(old_header, new_header)
else:
    print("Could not find old header.")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print("Done")
