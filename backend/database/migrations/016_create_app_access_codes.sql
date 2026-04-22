-- 里程碑22A：应用级邀请码表

CREATE TABLE IF NOT EXISTS app_access_codes (
  access_code_id VARCHAR(36) PRIMARY KEY COMMENT '邀请码ID',
  code VARCHAR(16) NOT NULL UNIQUE COMMENT '应用邀请码',
  status VARCHAR(20) NOT NULL DEFAULT 'active' COMMENT 'active/disabled/consumed/expired',
  max_uses INT NOT NULL DEFAULT 1 COMMENT '最大可使用次数',
  used_count INT NOT NULL DEFAULT 0 COMMENT '已使用次数',
  expires_at TIMESTAMP NULL DEFAULT NULL COMMENT '过期时间',
  bound_user_id VARCHAR(36) DEFAULT NULL COMMENT '首次消费后绑定的用户ID',
  note VARCHAR(255) DEFAULT '' COMMENT '备注',
  consumed_at TIMESTAMP NULL DEFAULT NULL COMMENT '最近一次消费时间',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_app_access_codes_status (status),
  INDEX idx_app_access_codes_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='应用级邀请码表';
