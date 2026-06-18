import pathlib

app_content = pathlib.Path('App.tsx').read_text(encoding='utf-8')

old_str = '''const progressPct = totalUnits > 0
                ? (countedUnits / totalUnits) * 100
                : Number(session.progress || 0);'''

new_str = '''// O progresso deve ser baseado em SKUs (como no AuditModule).
            // Para as auditorias "CONCLUIDA", o progresso real quando foram concluídas foi 100%.
            const isCompleted = session.status === 'CONCLUIDA' || session.status === 'FECHADA';
            const calculatedProgress = totalSkus > 0 ? (countedSkus / totalSkus) * 100 : Number(session.progress || 0);
            const progressPct = isCompleted ? 100 : calculatedProgress;'''

app_content = app_content.replace(old_str, new_str)
pathlib.Path('App.tsx').write_text(app_content, encoding='utf-8')
print("Replaced!")
