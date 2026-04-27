ALTER TABLE users
  ADD COLUMN can_issue_admission_code TINYINT(1) NOT NULL DEFAULT 0 COMMENT '普通用户是否允许发新用户邀请码',
  ADD COLUMN admission_code_quota_total INT DEFAULT NULL COMMENT '普通用户可成功邀请新用户总额度';

CREATE TABLE invite_codes (
  invite_code_id VARCHAR(36) PRIMARY KEY,
  code VARCHAR(16) NOT NULL UNIQUE,
  purpose VARCHAR(32) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  issuer_user_id VARCHAR(36) DEFAULT NULL,
  family_id VARCHAR(36) DEFAULT NULL,
  target_role VARCHAR(20) DEFAULT NULL,
  target_family_permission_role VARCHAR(20) DEFAULT NULL,
  slot_key VARCHAR(100) DEFAULT NULL,
  max_uses INT NOT NULL DEFAULT 1,
  used_count INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMP NULL DEFAULT NULL,
  consumed_by_user_id VARCHAR(36) DEFAULT NULL,
  consumed_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_invite_codes_purpose_status (purpose, status),
  INDEX idx_invite_codes_slot_key (slot_key),
  INDEX idx_invite_codes_issuer_user_id (issuer_user_id),
  INDEX idx_invite_codes_family_id (family_id),
  INDEX idx_invite_codes_expires_at (expires_at),
  CONSTRAINT fk_invite_codes_issuer_user FOREIGN KEY (issuer_user_id) REFERENCES users(user_id) ON DELETE SET NULL,
  CONSTRAINT fk_invite_codes_family FOREIGN KEY (family_id) REFERENCES families(family_id) ON DELETE CASCADE,
  CONSTRAINT fk_invite_codes_consumed_by_user FOREIGN KEY (consumed_by_user_id) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='统一邀请码表';
