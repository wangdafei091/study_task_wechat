-- M08: 新增重复任务父子关系字段
-- 执行前请确认 001-005 已执行完毕

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS parent_task_id VARCHAR(100) DEFAULT NULL COMMENT '重复任务的父任务ID，普通任务为NULL';

CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id);
