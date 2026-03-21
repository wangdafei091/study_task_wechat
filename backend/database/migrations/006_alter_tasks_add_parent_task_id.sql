-- M08: 新增重复任务父子关系字段
-- 执行前请确认 001-005 已执行完毕
--
-- 注意：使用 information_schema 实现幂等保护（MySQL 5.7 不支持 ADD COLUMN IF NOT EXISTS）
-- 可安全重复执行

-- 幂等添加列
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'parent_task_id'
);
SET @sql_col = IF(@col_exists = 0,
  'ALTER TABLE tasks ADD COLUMN parent_task_id VARCHAR(100) DEFAULT NULL COMMENT \'重复任务的父任务ID，普通任务为NULL\'',
  'SELECT \'column parent_task_id already exists, skipped\' AS info'
);
PREPARE stmt FROM @sql_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 幂等添加索引
SET @idx_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND INDEX_NAME = 'idx_tasks_parent_task_id'
);
SET @sql_idx = IF(@idx_exists = 0,
  'CREATE INDEX idx_tasks_parent_task_id ON tasks(parent_task_id)',
  'SELECT \'index idx_tasks_parent_task_id already exists, skipped\' AS info'
);
PREPARE stmt FROM @sql_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
