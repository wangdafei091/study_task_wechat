-- M07: 新增任务云端同步所需字段
-- 执行前请确认 001-004 已执行完毕
-- 修复：repeat 是保留关键字，如需添加 repeat 字段请使用 `repeat`

-- 检查并添加字段（避免重复执行时报错）
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL DEFAULT NULL COMMENT '软删除时间，NULL表示未删除',
  ADD COLUMN IF NOT EXISTS completion_time BIGINT NULL DEFAULT NULL COMMENT 'epoch ms，与前端Task模型一致',
  ADD COLUMN IF NOT EXISTS star_awarded TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已发放星星奖励',
  ADD COLUMN IF NOT EXISTS modify_time BIGINT NULL DEFAULT NULL COMMENT 'epoch ms，与前端Task模型一致',
  ADD COLUMN IF NOT EXISTS duration INT NULL DEFAULT 0 COMMENT '时长（分钟）',
  ADD COLUMN IF NOT EXISTS has_no_end_date TINYINT(1) NOT NULL DEFAULT 0 COMMENT '无截止日期标志',
  ADD COLUMN IF NOT EXISTS tags TEXT NULL COMMENT '标签数组（JSON字符串）';

-- 为软删除查询建立索引，提高过滤性能
CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at ON tasks(deleted_at);
