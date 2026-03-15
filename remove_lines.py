import os
try:
    os.remove('show_lines.py')
    print('removed')
except Exception as e:
    print('error', e)
