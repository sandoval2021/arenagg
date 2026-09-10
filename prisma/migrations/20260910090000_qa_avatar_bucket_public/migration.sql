DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    UPDATE storage.buckets
    SET public = true,
        file_size_limit = CASE
          WHEN file_size_limit IS NULL OR file_size_limit < 10485760 THEN 10485760
          ELSE file_size_limit
        END
    WHERE id = 'escudos';
  END IF;
END $$;
