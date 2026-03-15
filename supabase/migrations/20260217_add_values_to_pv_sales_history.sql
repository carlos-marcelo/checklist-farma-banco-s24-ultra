ALTER TABLE public.pv_sales_history
  ADD COLUMN IF NOT EXISTS unit_price numeric,
  ADD COLUMN IF NOT EXISTS value_sold_pv numeric,
  ADD COLUMN IF NOT EXISTS value_ignored numeric;
