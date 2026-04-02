-- 文件：database/migrations/012_alter_tasks_add_makeup_fields.sql
-- 说明：为必做任务逾期补做治理补充事实字段
-- 依赖：002_create_tasks.sql, 005_alter_tasks_add_fields.sql

ALTER TABLE tasks
  ADD COLUMN penalty_deducted_points INT NOT NULL DEFAULT 0 COMMENT '必做任务实际扣除星星数',
  ADD COLUMN penalty_refunded TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已执行逾期补做退星',
  ADD COLUMN penalty_refund_time BIGINT NULL DEFAULT NULL COMMENT '逾期补做退星时间（epoch ms）';
