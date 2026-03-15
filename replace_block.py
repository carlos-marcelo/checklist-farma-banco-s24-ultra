from pathlib import Path
new_block = """                                {stockConferenceHistory.length === 0 ? (
                                    <div className=\"text-center py-12 text-sm text-gray-500\">
                                        Nenhuma conferência de estoque registrada ainda.
                                    </div>
                                ) : (
                                    <div className=\"space-y-4\">
                                        <div className=\"space-y-4 border-b border-gray-100 pb-4\">
                                            <div className=\"flex flex-col gap-2 md:flex-row md:items-center md:justify-between\">
                                                <div className=\"flex items-center gap-2 text-sm text-gray-600\">
                                                    <Filter size={16} className=\"text-gray-400\" />
                                                    <span className=\"font-semibold text-gray-700\">Filtrar conferências</span>
                                                </div>
                                                <div className=\"text-xs text-gray-500\">
                                                    Mostrando {filteredStockConferenceHistory.length} de {stockConferenceHistory.length} conferência(s)
                                                </div>
                                            </div>
                                            <div className=\"space-y-2\">
                                                <div className=\"text-[10px] uppercase tracking-widest text-gray-400\">Filiais</div>
                                                <div className=\"flex flex-wrap gap-2\">
                                                    {stockConferenceBranches.map(branch => (
                                                        <button
                                                            type=\"button\"
                                                            onClick={() => toggleStockBranchFilter(branch)}
                                                            className={px-3 py-1.5 rounded-full text-xs font-semibold border transition }
                                                        >
                                                            {branch}
                                                        </button>
                                                    ))}
                                                    {stockBranchFilters.length > 0 && (
                                                        <button
                                                            type=\"button\"
                                                            onClick={handleResetStockBranchFilters}
                                                            className=\"px-3 py-1.5 rounded-full border border-gray-200 bg-white text-xs text-gray-500 hover:bg-gray-50 transition\"
                                                        >
                                                            Limpar
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            <div className=\"flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between\">
                                                <span className=\"text-[10px] uppercase tracking-widest text-gray-400\">Área</span>
                                                <select
                                                    value={stockAreaFilter}
                                                    onChange={(e) => handleStockAreaFilterChange(e.target.value)}
                                                    className=\"ml-0 w-full max-w-xs text-sm rounded-xl border border-gray-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500\"
                                                >
                                                    <option value=\"all\">Todas as áreas</option>
                                                    {stockConferenceAreas.map(area => (
                                                        <option key={area} value={area}>{area}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        {filteredStockConferenceHistory.length === 0 ? (
                                            <div className=\"text-center py-12 text-sm text-gray-500\">
                                                Nenhuma conferência de estoque encontrada com os filtros aplicados.
                                            </div>
                                        ) : (
                                            <div className=\"space-y-4\">
                                                {filteredStockConferenceHistory.map(item => {
                                                    const createdDate = new Date(item.createdAt);
                                                    return (
                                                        <div key={item.id} className=\"border border-gray-100 rounded-2xl p-4 shadow-sm bg-white\">
                                                            <div className=\"flex flex-col md:flex-row md:items-center md:justify-between gap-3\">
                                                                <div>
                                                                    <p className=\"text-xs uppercase tracking-widest text-gray-400\">Filial</p>
                                                                    <p className=\"text-base font-bold text-gray-800\">{item.branch}</p>
                                                                    <p className=\"text-sm text-gray-600 mt-1\">Área: {item.area}</p>
                                                                    <p className=\"text-xs text-gray-500 mt-1\">
                                                                        {createdDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })} às {createdDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                                    </p>
                                                                </div>
                                                                <div className=\"bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-[11px] font-bold\">
                                                                    {Math.round(item.percent)}% concluído
                                                                </div>
                                                            </div>
                                                            <div className=\"mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-sm\">
                                                                <div className=\"bg-gray-50 rounded-xl py-3 border border-gray-100\">
                                                                    <p className=\"text-[10px] uppercase text-gray-400\">Total</p>
                                                                    <p className=\"text-lg font-bold text-gray-800\">{item.total}</p>
                                                                </div>
                                                                <div className=\"bg-green-50 rounded-xl py-3 border border-green-100\">
                                                                    <p className=\"text-[10px] uppercase text-green-500\">Corretos</p>
                                                                    <p className=\"text-lg font-bold text-green-700\">{item.matched}</p>
                                                                </div>
                                                                <div className=\"bg-red-50 rounded-xl py-3 border border-red-100\">
                                                                    <p className=\"text-[10px] uppercase text-red-500\">Divergentes</p>
                                                                    <p className=\"text-lg font-bold text-red-600\">{item.divergent}</p>
                                                                </div>
                                                                <div className=\"bg-yellow-50 rounded-xl py-3 border border-yellow-100\">
                                                                    <p className=\"text-[10px] uppercase text-yellow-600\">Pendente</p>
                                                                    <p className=\"text-lg font-bold text-yellow-700\">{item.pending}</p>
                                                                </div>
                                                            </div>
                                                            <div className=\"mt-4 flex flex-wrap gap-2 text-[11px] text-gray-500\">
                                                                <span className=\"px-2 py-1 rounded-full bg-gray-100 border border-gray-200\">Responsável: {item.userName}</span>
                                                                <span className=\"px-2 py-1 rounded-full bg-gray-100 border border-gray-200\">Farmacêutico: {item.pharmacist}</span>
                                                                <span className=\"px-2 py-1 rounded-full bg-gray-100 border border-gray-200\">Gestor: {item.manager}</span>
                                                            </div>
                                                            <div className=\"mt-4 flex justify-end\">
                                                                <button
                                                                    onClick={() => handleViewStockConferenceReport(item.id)}
                                                                    className=\"flex items-center gap-2 rounded-2xl px-4 py-2 bg-blue-600 text-white text-sm font-bold shadow-lg hover:bg-blue-700 transition\"
                                                                >
                                                                    <FileText size={16} />
                                                                    Ver Conferência
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
"""

path = Path('App.tsx')
text = path.read_text(encoding='utf-8')
start = text.index('                                {stockConferenceHistory.length === 0 ? (')
end = text.index('\n                            </div>', start)
text = text[:start] + new_block + text[end:]
path.write_text(text, encoding='utf-8')
