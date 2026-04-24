import sys

filepath = 'components/AnaliseResultados/AnaliseDashboard.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

old_header = """                        <h3 className="text-xl font-black text-gray-900 flex items-center gap-3">
                            <Building2 size={24} className="text-indigo-500" />
                            Raio-X por Filial
                        </h3>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">
                            Comparativo matriz das lojas {selectedArea !== 'ALL' ? `da ${selectedArea}` : 'de toda a rede'}
                        </p>
                    </div>
                </div>"""

new_header = """                        <h3 className="text-xl font-black text-gray-900 flex items-center gap-3">
                            <Building2 size={24} className="text-indigo-500" />
                            Raio-X por Filial
                        </h3>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">
                            Comparativo matriz das lojas {selectedArea !== 'ALL' ? `da ${selectedArea}` : 'de toda a rede'}
                        </p>
                    </div>
                    {rawState.vendasUpdatedAt && (
                        <div className="flex flex-col items-end border border-gray-200 bg-white rounded-xl px-4 py-2 shadow-sm">
                            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Atualizado em</span>
                            <span className="text-sm font-bold text-gray-700">{formatDateToBr(rawState.vendasUpdatedAt)}</span>
                        </div>
                    )}
                </div>"""

if old_header in content:
    content = content.replace(old_header, new_header)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Done header replacement.")
else:
    print("Could not find old header.")
