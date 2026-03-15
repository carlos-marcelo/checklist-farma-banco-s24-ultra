import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://efqkcehhtuxiccdmnzku.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmcWtjZWhodHV4aWNjZG1uemt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3NTk0NTUsImV4cCI6MjA4MDMzNTQ1NX0.CA5pNsOTOIgqQfvtW1FIsAV53CZoj2V_E6-CZdejAl4';

const supabase = createClient(supabaseUrl, supabaseKey);

const idsToFix = [
    '3911e5b5-53e5-4657-9a10-7e2e4d2aa1f6', // F7
    '60d684db-31a3-45a6-84fc-ba90f4ab4a45'  // F13
];

async function fix() {
    console.log("Starting fix for reports:", idsToFix);

    for (const id of idsToFix) {
        const { data: report, error } = await supabase
            .from('reports')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            console.error(`Error fetching report ${id}:`, error);
            continue;
        }

        let formData = report.form_data;
        // Handle stringified JSON just in case, though usually it comes as object
        if (typeof formData === 'string') {
            try {
                formData = JSON.parse(formData);
            } catch (e) {
                console.error(`Error parsing JSON for ${id}`, e); continue;
            }
        }

        let updated = false;
        // Iterate over all keys (checklists) in form_data
        for (const checklistKey of Object.keys(formData)) {
            const section = formData[checklistKey];
            // Check if it looks like a checklist data object
            if (section && typeof section === 'object') {
                // Inject the missing info
                if (!section.empresa || !section.area) {
                    section.empresa = "Drogaria Cidade";
                    section.area = "Área 2";
                    updated = true;
                }
            }
        }

        if (updated) {
            const { error: updateError } = await supabase
                .from('reports')
                .update({ form_data: formData })
                .eq('id', id);

            if (updateError) {
                console.error(`Error updating report ${id}:`, updateError);
            } else {
                console.log(`✅ Successfully updated report ${id} with Company and Area.`);
            }
        } else {
            console.log(`No changes needed for report ${id}.`);
        }
    }
}

fix();
