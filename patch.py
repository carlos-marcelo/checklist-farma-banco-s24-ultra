import sys

with open('App.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add state
content = content.replace(
    "const [dashboardAuditsFetchedAt, setDashboardAuditsFetchedAt] = useState<string | null>(null);",
    "const [dashboardAuditsFetchedAt, setDashboardAuditsFetchedAt] = useState<string | null>(null);\n    const [openAuditNumberFilter, setOpenAuditNumberFilter] = useState<string>('all');"
)

# Add logic
old_logic = """        const latestByBranch = new Map<string, SupabaseService.DbAuditSession>();
        dashboardAuditSessions.forEach(session => {"""

new_logic = """        let filteredSessions = dashboardAuditSessions;
        if (openAuditNumberFilter !== 'all') {
            const tgtNum = Number(openAuditNumberFilter);
            filteredSessions = filteredSessions.filter(s => Number(s.audit_number || 0) === tgtNum);
        }

        const latestByBranch = new Map<string, SupabaseService.DbAuditSession>();
        filteredSessions.forEach(session => {"""

content = content.replace(old_logic, new_logic)

# Add dependency
content = content.replace(
    "}, [dashboardAuditSessions, scopedCompanies, scopedUsers]);\n\n    const dashboardCompletedAuditOverview = useMemo(() => {",
    "}, [dashboardAuditSessions, scopedCompanies, scopedUsers, openAuditNumberFilter]);\n\n    const dashboardCompletedAuditOverview = useMemo(() => {"
)

# Add UI
old_ui = """                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-end gap-3">"""

new_ui = """                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="relative">
                                                <select
                                                    value={openAuditNumberFilter}
                                                    onChange={(e) => setOpenAuditNumberFilter(e.target.value)}
                                                    className="appearance-none bg-white border border-gray-200 text-gray-700 text-xs font-black uppercase tracking-widest rounded-xl px-4 py-2 pr-8 hover:bg-gray-50 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                                                >
                                                    <option value="all">Todas as auditorias</option>
                                                    {Array.from(new Set(dashboardAuditSessions.map(s => Number(s.audit_number || 0)).filter(n => n > 0)))
                                                        .sort((a, b) => a - b)
                                                        .map(num => (
                                                            <option key={num} value={String(num)}>Auditoria {num}</option>
                                                        ))
                                                    }
                                                </select>
                                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                                                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-end gap-3">"""

content = content.replace(old_ui, new_ui)

with open('App.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
