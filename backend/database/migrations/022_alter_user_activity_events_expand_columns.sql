-- M22T: 扩充用户行为事件埋点字段长度，兼容更长的版本号与页面标识
-- 可安全重复执行

SET @app_version_col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'user_activity_events'
    AND COLUMN_NAME = 'app_version'
);
SET @app_version_sql = IF(@app_version_col_exists = 1,
  'ALTER TABLE user_activity_events MODIFY COLUMN app_version VARCHAR(64) DEFAULT NULL',
  'SELECT ''column app_version missing, skipped'' AS info'
);
PREPARE stmt FROM @app_version_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @source_page_col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'user_activity_events'
    AND COLUMN_NAME = 'source_page'
);
SET @source_page_sql = IF(@source_page_col_exists = 1,
  'ALTER TABLE user_activity_events MODIFY COLUMN source_page VARCHAR(255) DEFAULT NULL',
  'SELECT ''column source_page missing, skipped'' AS info'
);
PREPARE stmt FROM @source_page_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
