import pathlib
text = pathlib.Path('App.tsx').read_text(encoding='utf-8')
for idx, ch in enumerate(text):
    if ch == 'Ã':
        print(idx, text[max(0, idx-20):idx+20])
