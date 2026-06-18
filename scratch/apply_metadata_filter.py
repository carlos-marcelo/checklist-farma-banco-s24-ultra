import pathlib

# Let's write the python patch script to insert isMetadataRow filtering in both files.

is_metadata_row_def = """                const metadataKeywords = [
                    'filial:', 'grupo de produtos:', 'departamento:', 'categoria:',
                    'tipo de produto:', 'grupo de preço:', 'início contagem:',
                    'conferência de estoque', 'código', 'página 1 de', 'produto:'
                ];

                const isMetadataRow = (item: any) => {
                    const codigo = String(item.code || '').trim().toLowerCase();
                    const descricao = String(item.description || '').trim().toLowerCase();

                    if (metadataKeywords.some(keyword => codigo.startsWith(keyword) || descricao.startsWith(keyword))) {
                        return true;
                    }
                    if ((!codigo && !descricao) || codigo === '-' || descricao === '-' || (codigo === '' && descricao === '-')) {
                        return true;
                    }
                    return false;
                };

                const cleanExcelItems = uniqueExcelItems.filter((item: any) => !isMetadataRow(item));"""

app_path = 'App.tsx'
app_content = pathlib.Path(app_path).read_text(encoding='utf-8')

# In App.tsx:
# We replaced:
#                 const merged = mergeExcelMetricsPoolsLocal(pools);
#                 const uniqueExcelItems = merged?.items || [];
# 
#                 uniqueExcelItems.forEach((item: any) => {

old_target_app = """                const merged = mergeExcelMetricsPoolsLocal(pools);
                const uniqueExcelItems = merged?.items || [];

                uniqueExcelItems.forEach((item: any) => {"""

new_target_app = """const merged = mergeExcelMetricsPoolsLocal(pools);
                const uniqueExcelItems = merged?.items || [];

                const metadataKeywords = [
                    'filial:', 'grupo de produtos:', 'departamento:', 'categoria:',
                    'tipo de produto:', 'grupo de preço:', 'início contagem:',
                    'conferência de estoque', 'código', 'página 1 de', 'produto:'
                ];

                const isMetadataRow = (item: any) => {
                    const codigo = String(item.code || '').trim().toLowerCase();
                    const descricao = String(item.description || '').trim().toLowerCase();

                    if (metadataKeywords.some(keyword => codigo.startsWith(keyword) || descricao.startsWith(keyword))) {
                        return true;
                    }
                    if ((!codigo && !descricao) || codigo === '-' || descricao === '-' || (codigo === '' && descricao === '-')) {
                        return true;
                    }
                    return false;
                };

                const cleanExcelItems = uniqueExcelItems.filter((item: any) => !isMetadataRow(item));

                cleanExcelItems.forEach((item: any) => {"""

if old_target_app in app_content:
    app_content = app_content.replace(old_target_app, new_target_app)
    print("App.tsx replaced successfully!")
else:
    old_target_app_rn = old_target_app.replace('\n', '\r\n')
    if old_target_app_rn in app_content:
        app_content = app_content.replace(old_target_app_rn, new_target_app.replace('\n', '\r\n'))
        print("App.tsx replaced successfully (CRLF)!")
    else:
        print("Error: App.tsx target not found")

pathlib.Path(app_path).write_text(app_content, encoding='utf-8')


# Now components/auditoria/AuditModule.tsx:
audit_path = 'components/auditoria/AuditModule.tsx'
audit_content = pathlib.Path(audit_path).read_text(encoding='utf-8')

old_target_audit = """            const merged = mergeExcelMetricsPoolsLocal(pools);
            const uniqueExcelItems = merged?.items || [];

            uniqueExcelItems.forEach((item: any) => {"""

new_target_audit = """const merged = mergeExcelMetricsPoolsLocal(pools);
            const uniqueExcelItems = merged?.items || [];

            const metadataKeywords = [
                'filial:', 'grupo de produtos:', 'departamento:', 'categoria:',
                'tipo de produto:', 'grupo de preço:', 'início contagem:',
                'conferência de estoque', 'código', 'página 1 de', 'produto:'
            ];

            const isMetadataRow = (item: any) => {
                const codigo = String(item.code || '').trim().toLowerCase();
                const descricao = String(item.description || '').trim().toLowerCase();

                if (metadataKeywords.some(keyword => codigo.startsWith(keyword) || descricao.startsWith(keyword))) {
                    return true;
                }
                if ((!codigo && !descricao) || codigo === '-' || descricao === '-' || (codigo === '' && descricao === '-')) {
                    return true;
                }
                return false;
            };

            const cleanExcelItems = uniqueExcelItems.filter((item: any) => !isMetadataRow(item));

            cleanExcelItems.forEach((item: any) => {"""

if old_target_audit in audit_content:
    audit_content = audit_content.replace(old_target_audit, new_target_audit)
    print("AuditModule.tsx replaced successfully!")
else:
    old_target_audit_rn = old_target_audit.replace('\n', '\r\n')
    if old_target_audit_rn in audit_content:
        audit_content = audit_content.replace(old_target_audit_rn, new_target_audit.replace('\n', '\r\n'))
        print("AuditModule.tsx replaced successfully (CRLF)!")
    else:
        print("Error: AuditModule.tsx target not found")

pathlib.Path(audit_path).write_text(audit_content, encoding='utf-8')
