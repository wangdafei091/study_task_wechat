-- 里程碑22M：系统级用户权限与禁入治理

ALTER TABLE users
  ADD COLUMN system_access_level VARCHAR(16) NOT NULL DEFAULT 'normal' COMMENT '系统级访问级别 normal|readonly|blocked',
  ADD COLUMN system_access_updated_by_user_id VARCHAR(36) DEFAULT NULL COMMENT '系统级访问级别最后更新人',
  ADD COLUMN system_access_updated_at TIMESTAMP NULL DEFAULT NULL COMMENT '系统级访问级别最后更新时间';
