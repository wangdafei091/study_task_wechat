-- 文件：database/migrations/013_create_task_templates.sql
-- 说明：新增家庭共享任务模板表
-- 依赖：003_create_families.sql, 004_update_users_for_family.sql

CREATE TABLE IF NOT EXISTS task_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  template_id VARCHAR(64) NOT NULL COMMENT '模板业务ID',
  family_id VARCHAR(64) NOT NULL COMMENT '所属家庭ID',
  name VARCHAR(100) NOT NULL COMMENT '模板名称',
  description VARCHAR(255) NULL DEFAULT '' COMMENT '模板说明',
  task_payload JSON NOT NULL COMMENT '模板任务载荷',
  date_strategy JSON NOT NULL COMMENT '日期策略',
  enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  usage_count INT NOT NULL DEFAULT 0 COMMENT '使用次数',
  last_used_at BIGINT NULL DEFAULT NULL COMMENT '最近使用时间 epoch ms',
  created_by_user_id VARCHAR(64) NULL DEFAULT NULL COMMENT '创建者用户ID',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_task_templates_template_id (template_id),
  KEY idx_task_templates_family_enabled (family_id, enabled),
  KEY idx_task_templates_family_last_used (family_id, last_used_at),
  KEY idx_task_templates_family_usage (family_id, usage_count),
  KEY idx_task_templates_family_deleted (family_id, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='家庭共享任务模板';
