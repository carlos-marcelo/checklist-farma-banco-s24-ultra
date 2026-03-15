from pathlib import Path
text = Path('App.tsx').read_text(encoding='utf-8')
start = text.index("const formatFullDateTime")
end = text.index('};', start)
print(repr(text[start:end+2]))
