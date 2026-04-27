-- 文件：database/migrations/011_alter_tasks_add_reminder.sql
-- 说明：为任务表补充 reminder JSON 字段，供 upcoming 云端提醒使用
-- 依赖：002_create_tasks.sql, 005_alter_tasks_add_fields.sql

ALTER TABLE tasks
  ADD COLUMN reminder JSON NULL COMMENT '提醒配置 { enabled, time }' AFTER end_time;
