import os

filepath = r"c:\Users\marce\Documents\Sites\checklist-farma-banco-s24-ultra\App.tsx"

with open(filepath, "r", encoding="utf-8") as f:
    lines = f.readlines()

target_idx = -1
for idx, line in enumerate(lines):
    if "Resumo de Auditorias Concluídas" in line:
        target_idx = idx
        break

if target_idx != -1:
    print(f"Encontrado na linha {target_idx + 1}: {lines[target_idx].strip()}")
    # Achar a linha com "flex items-center justify-end gap-3" que vem logo depois
    for j in range(target_idx + 1, target_idx + 10):
        if "flex items-center justify-end gap-3" in lines[j]:
            indent = lines[j].split("<div")[0]
            # Inserir o botão logo abaixo da div
            button_code = (
                f"{indent}    <button\n"
                f"{indent}        type=\"button\"\n"
                f"{indent}        onClick={{handleExportAllCompletedAuditsExcel}}\n"
                f"{indent}        className=\"inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md active:scale-95 whitespace-nowrap\"\n"
                f"{indent}        title=\"Exportar planilha consolidada de perdas/sobras de todas as filiais concluídas\"\n"
                f"{indent}    >\n"
                f"{indent}        <FileSpreadsheet size={{14}} />\n"
                f"{indent}        Excel Detalhado Rede\n"
                f"{indent}    </button>\n"
            )
            lines[j] = lines[j] + button_code
            print("Botão inserido com sucesso!")
            break

    with open(filepath, "w", encoding="utf-8") as f:
        f.writelines(lines)
else:
    print("Texto âncora não encontrado!")
