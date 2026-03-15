-- Add area column to stock conference reports table
ALTER TABLE public.stock_conference_reports
  ADD COLUMN IF NOT EXISTS area text;
