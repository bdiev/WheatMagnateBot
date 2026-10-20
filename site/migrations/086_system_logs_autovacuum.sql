-- Retention deletes rows but does not compact existing table/index files.
-- Reclaim dead rows sooner so subsequent log inserts can reuse their space.
-- A fresh installation creates this optional table after migrations run.
DO $$
BEGIN
  IF to_regclass('site_system_logs') IS NOT NULL THEN
    ALTER TABLE site_system_logs SET (
      autovacuum_vacuum_scale_factor = 0.02,
      autovacuum_vacuum_threshold = 500,
      autovacuum_analyze_scale_factor = 0.05,
      autovacuum_analyze_threshold = 500,
      toast.autovacuum_vacuum_scale_factor = 0.02,
      toast.autovacuum_vacuum_threshold = 500
    );
  END IF;
END
$$;
