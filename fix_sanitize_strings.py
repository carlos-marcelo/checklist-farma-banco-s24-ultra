from pathlib import Path
path = Path('App.tsx')
text = path.read_text(encoding='utf-8')
old_branch = "const sanitizeStockBranch = (branch?: string) => branch?.trim() || 'Filial nÃ\x83Â£o informada';"
old_area = "const sanitizeStockArea = (area?: string) => area?.trim() || 'Ã\x83rea nÃ\x83Â£o informada';"
if old_branch not in text or old_area not in text:
    raise SystemExit('patterns not found')
text = text.replace(old_branch, "const sanitizeStockBranch = (branch?: string) => branch?.trim() || 'Filial não informada';", 1)
text = text.replace(old_area, "const sanitizeStockArea = (area?: string) => area?.trim() || 'Área não informada';", 1)
path.write_text(text, encoding='utf-8')
