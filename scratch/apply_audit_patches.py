import pathlib

audit_path = 'components/auditoria/AuditModule.tsx'
content = pathlib.Path(audit_path).read_text(encoding='utf-8')

# 1. Update filialTotalsMetrics doneUnits and doneCost
old_metrics = """            doneUnits: Number(branchMetrics.doneUnits || 0),
            totalUnits: Number(branchMetrics.units || 0),
            doneCost: Number(branchMetrics.doneCost || 0),"""

new_metrics = """            doneUnits: Number(branchMetrics.doneUnits || 0) + diffQty,
            totalUnits: Number(branchMetrics.units || 0),
            doneCost: Number(branchMetrics.doneCost || 0) + diffCost,"""

# Verify if we can find old_metrics
if old_metrics in content:
    content = content.replace(old_metrics, new_metrics)
    print("Step 1 (filialTotalsMetrics) success!")
else:
    print("Step 1 error: old_metrics not found")

# 2. Update PDF summaryRows
old_pdf_1 = "['Unidades Totais (Conf./Total)', `${fmtInt(Number(branchMetrics.doneUnits || 0))} / ${fmtInt(Number(branchMetrics.units || 0))}`]"
new_pdf_1 = "['Unidades Totais (Conf./Total)', `${fmtInt(Number(filialTotalsMetrics.doneUnits || 0))} / ${fmtInt(Number(branchMetrics.units || 0))}`]"

old_pdf_2 = "['Valor em Custo (Conf./Total)', `${fmtCurrency(Number(branchMetrics.doneCost || 0))} / ${fmtCurrency(Number(branchMetrics.cost || 0))}`]"
new_pdf_2 = "['Valor em Custo (Conf./Total)', `${fmtCurrency(Number(filialTotalsMetrics.doneCost || 0))} / ${fmtCurrency(Number(branchMetrics.cost || 0))}`]"

if old_pdf_1 in content:
    content = content.replace(old_pdf_1, new_pdf_1)
    print("Step 2a (PDF 1) success!")
else:
    print("Step 2a error: old_pdf_1 not found")

if old_pdf_2 in content:
    content = content.replace(old_pdf_2, new_pdf_2)
    print("Step 2b (PDF 2) success!")
else:
    print("Step 2b error: old_pdf_2 not found")

# 3. Update detailed PDF summaryData
old_pdf_3 = '["SKUs CONFERIDOS", branchMetrics.doneSkus.toLocaleString(), "UNIDADES CONFERIDAS", Math.round(branchMetrics.doneUnits).toLocaleString()]'
new_pdf_3 = '["SKUs CONFERIDOS", branchMetrics.doneSkus.toLocaleString(), "UNIDADES CONFERIDAS", Math.round(filialTotalsMetrics.doneUnits).toLocaleString()]'

old_pdf_4 = '["VALOR TOTAL (Custo)", `R$ ${branchMetrics.cost.toLocaleString(\'pt-BR\', { minimumFractionDigits: 2 })RobustRegexPlaceholder}`'
# Since it contains backticks and single quotes, let's look for:
# ["VALOR TOTAL (Custo)", `R$ ${branchMetrics.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, "VALOR CONFERIDO", `R$ ${branchMetrics.doneCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`]
old_pdf_4 = '["VALOR TOTAL (Custo)", `R$ ${branchMetrics.cost.toLocaleString(\'pt-BR\', { minimumFractionDigits: 2 })RobustRegex}`'

# Let's do exact match
target_pdf_4 = '["VALOR TOTAL (Custo)", `R$ ${branchMetrics.cost.toLocaleString(\'pt-BR\', { minimumFractionDigits: 2 })RobustRegex`'
# Wait, let's look at lines 6725 and 6727 from the print script:
# 6725:             ["SKUs CONFERIDOS", branchMetrics.doneSkus.toLocaleString(), "UNIDADES CONFERIDAS", Math.round(branchMetrics.doneUnits).toLocaleString()],
# 6727:             ["VALOR TOTAL (Custo)", `R$ ${branchMetrics.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, "VALOR CONFERIDO", `R$ ${branchMetrics.doneCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`]

old_pdf_3 = '["SKUs CONFERIDOS", branchMetrics.doneSkus.toLocaleString(), "UNIDADES CONFERIDAS", Math.round(branchMetrics.doneUnits).toLocaleString()]'
new_pdf_3 = '["SKUs CONFERIDOS", branchMetrics.doneSkus.toLocaleString(), "UNIDADES CONFERIDAS", Math.round(filialTotalsMetrics.doneUnits).toLocaleString()]'

old_pdf_4 = '["VALOR TOTAL (Custo)", `R$ ${branchMetrics.cost.toLocaleString(\'pt-BR\', { minimumFractionDigits: 2 })RobustRegex`'
# Let's write the string exactly:
old_pdf_4 = '["VALOR TOTAL (Custo)", `R$ ${branchMetrics.cost.toLocaleString(\'pt-BR\', { minimumFractionDigits: 2 })}`, "VALOR CONFERIDO", `R$ ${branchMetrics.doneCost.toLocaleString(\'pt-BR\', { minimumFractionDigits: 2 })}`]'
new_pdf_4 = '["VALOR TOTAL (Custo)", `R$ ${branchMetrics.cost.toLocaleString(\'pt-BR\', { minimumFractionDigits: 2 })}`, "VALOR CONFERIDO", `R$ ${filialTotalsMetrics.doneCost.toLocaleString(\'pt-BR\', { minimumFractionDigits: 2 })}`]'

if old_pdf_3 in content:
    content = content.replace(old_pdf_3, new_pdf_3)
    print("Step 3a (PDF 3) success!")
else:
    print("Step 3a error: old_pdf_3 not found")

if old_pdf_4 in content:
    content = content.replace(old_pdf_4, new_pdf_4)
    print("Step 3b (PDF 4) success!")
else:
    print("Step 3b error: old_pdf_4 not found")

# 4. Update Header JSX
old_header_1 = '<span className="text-[clamp(0.9rem,1.25vw,1.2rem)] font-black text-indigo-700 tabular-nums leading-none whitespace-nowrap">{Math.round(branchMetrics.doneUnits).toLocaleString()}</span>'
new_header_1 = '<span className="text-[clamp(0.9rem,1.25vw,1.2rem)] font-black text-indigo-700 tabular-nums leading-none whitespace-nowrap">{Math.round(filialTotalsMetrics.doneUnits).toLocaleString()}</span>'

old_header_2 = '<span className="text-[clamp(0.88rem,1.2vw,1.15rem)] font-black text-emerald-700 tabular-nums leading-none whitespace-nowrap">R$ {branchMetrics.doneCost.toLocaleString(\'pt-BR\', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>'
new_header_2 = '<span className="text-[clamp(0.88rem,1.2vw,1.15rem)] font-black text-emerald-700 tabular-nums leading-none whitespace-nowrap">R$ {filialTotalsMetrics.doneCost.toLocaleString(\'pt-BR\', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>'

if old_header_1 in content:
    content = content.replace(old_header_1, new_header_1)
    print("Step 4a (Header 1) success!")
else:
    print("Step 4a error: old_header_1 not found")

if old_header_2 in content:
    content = content.replace(old_header_2, new_header_2)
    print("Step 4b (Header 2) success!")
else:
    print("Step 4b error: old_header_2 not found")

pathlib.Path(audit_path).write_text(content, encoding='utf-8')
print("AuditModule.tsx successfully updated!")
