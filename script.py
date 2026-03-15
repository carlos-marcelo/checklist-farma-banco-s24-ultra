from pathlib import Path
path = Path('App.tsx')
text = path.read_text(encoding='latin-1')
target = "            area: rep.area || "
pos = text.find(target)
if pos == -1:
    raise SystemExit('area target not found')
line_end = text.find('\n', pos)
text = text[:pos] + "            area: areaName," + text[line_end:]
path.write_text(text, encoding='latin-1')
