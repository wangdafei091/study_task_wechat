-- 文件：database/migrations/014_alter_tasks_add_occurrence_fields.sql
-- 说明：为任务表补充 occurrence 模式字段与索引
-- 依赖：002_create_tasks.sql, 005_alter_tasks_add_fields.sql, 006_alter_tasks_add_parent_task_id.sql

ALTER TABLE tasks
  ADD COLUMN execution_mode VARCHAR(20) NOT NULL DEFAULT 'planned' COMMENT '任务执行方式：planned/occurrence',
  ADD COLUMN active_start_date DATE NULL DEFAULT NULL COMMENT '表现项生效开始日期',
  ADD COLUMN active_end_date DATE NULL DEFAULT NULL COMMENT '表现项生效结束日期',
  ADD COLUMN active_has_no_end_date TINYINT(1) NOT NULL DEFAULT 0 COMMENT '表现项是否长期有效',
  ADD COLUMN is_occurrence_record TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否为表现记录实例',
  ADD COLUMN occurrence_outcome VARCHAR(20) NOT NULL DEFAULT 'none' COMMENT '表现记录结果：none/success/failure',
  ADD COLUMN recorded_at BIGINT NULL DEFAULT NULL COMMENT '表现记录时间（epoch ms）';

CREATE INDEX idx_tasks_execution_mode ON tasks (user_id, execution_mode, date);
CREATE INDEX idx_tasks_occurrence_active_range ON tasks (user_id, execution_mode, active_start_date, active_end_date);
CREATE INDEX idx_tasks_occurrence_lookup ON tasks (parent_task_id, user_id, date);
