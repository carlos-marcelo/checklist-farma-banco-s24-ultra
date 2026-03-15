import itertools
with open('App.tsx','r',encoding='utf-8') as f:
    for i,line in enumerate(f,1):
        if 250 <= i <= 330:
            print(f"{i:04d}: {line.rstrip()}" )
