-- 里程碑22B：系统管理员与系统级配置

ALTER TABLE users
  ADD COLUMN is_system_admin TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否系统管理员';

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key VARCHAR(64) PRIMARY KEY COMMENT '配置键',
  setting_value VARCHAR(255) NOT NULL COMMENT '配置值',
  updated_by_user_id VARCHAR(36) DEFAULT NULL COMMENT '最后更新人',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_system_settings_updated_by_user_id (updated_by_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统级配置表';
