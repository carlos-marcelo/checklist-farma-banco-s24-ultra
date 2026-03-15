import re
with open('App.tsx','r',encoding='utf-8') as f:
    text = f.read()
needle = 'Filial n'
pos = text.find(needle)
print('pos', pos)
print(repr(text[pos:pos+20]))
print(text[pos:pos+20])
