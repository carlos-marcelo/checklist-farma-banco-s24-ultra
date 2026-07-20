-- Ajustes após auditoria são dados financeiros. Esta função serializa as
-- alterações por sessão e modifica somente a lista de ajustes dentro do JSONB.
-- Assim, usuários/abas concorrentes não sobrescrevem a auditoria inteira.
CREATE OR REPLACE FUNCTION public.apply_audit_post_adjustments(
    p_branch text,
    p_audit_number integer,
    p_adjustments jsonb DEFAULT '[]'::jsonb,
    p_deleted_adjustment_ids text[] DEFAULT ARRAY[]::text[],
    p_user_email text DEFAULT NULL
)
RETURNS SETOF public.audit_sessions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    target public.audit_sessions%ROWTYPE;
    existing_adjustments jsonb;
    next_adjustments jsonb;
BEGIN
    SELECT *
      INTO target
      FROM public.audit_sessions
     WHERE branch = trim(p_branch)
       AND audit_number = p_audit_number
     FOR UPDATE;

    IF NOT FOUND OR target.status = 'completed' OR target.data IS NULL THEN
        RETURN;
    END IF;

    existing_adjustments := CASE
        WHEN jsonb_typeof(target.data->'postAuditAdjustments') = 'array'
            THEN target.data->'postAuditAdjustments'
        ELSE '[]'::jsonb
    END;

    WITH existing_rows AS (
        -- Mantém apenas a ocorrência mais recente caso algum snapshot antigo já
        -- tenha gravado o mesmo ID duas vezes.
        SELECT DISTINCT ON (coalesce(value->>'id', '__without_id_' || ordinality::text))
               value AS item, ordinality AS ord
          FROM jsonb_array_elements(existing_adjustments) WITH ORDINALITY
         ORDER BY coalesce(value->>'id', '__without_id_' || ordinality::text), ordinality DESC
    ), incoming_rows AS (
        SELECT DISTINCT ON (value->>'id')
               value - 'syncStatus' - 'syncToken' AS item,
               ordinality AS ord
          FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(p_adjustments) = 'array' THEN p_adjustments ELSE '[]'::jsonb END
          ) WITH ORDINALITY
         WHERE coalesce(value->>'id', '') <> ''
         ORDER BY value->>'id', ordinality DESC
    ), retained AS (
        SELECT e.item, e.ord
          FROM existing_rows e
         WHERE NOT ((e.item->>'id') = ANY(coalesce(p_deleted_adjustment_ids, ARRAY[]::text[])))
           AND NOT EXISTS (SELECT 1 FROM incoming_rows i WHERE i.item->>'id' = e.item->>'id')
    ), patched AS (
        SELECT (coalesce(e.item, '{}'::jsonb) || i.item) AS item,
               coalesce(e.ord, 1000000000::bigint + i.ord) AS ord
          FROM incoming_rows i
          LEFT JOIN existing_rows e ON e.item->>'id' = i.item->>'id'
         WHERE NOT ((i.item->>'id') = ANY(coalesce(p_deleted_adjustment_ids, ARRAY[]::text[])))
    )
    SELECT coalesce(jsonb_agg(item ORDER BY ord), '[]'::jsonb)
      INTO next_adjustments
      FROM (
          SELECT * FROM retained
          UNION ALL
          SELECT * FROM patched
      ) merged;

    UPDATE public.audit_sessions
       SET data = jsonb_set(target.data, '{postAuditAdjustments}', next_adjustments, true),
           user_email = coalesce(nullif(trim(p_user_email), ''), target.user_email),
           updated_at = now()
     WHERE id = target.id
     RETURNING * INTO target;

    RETURN NEXT target;
    RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_audit_post_adjustments(text, integer, jsonb, text[], text)
TO anon, authenticated;
