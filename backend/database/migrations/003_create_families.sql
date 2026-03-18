-- 里程碑06：创建家庭表
-- backend/database/migrations/003_create_families.sql

CREATE TABLE IF NOT EXISTS families (
    family_id              VARCHAR(36)  PRIMARY KEY,
    name                   VARCHAR(100) NOT NULL    COMMENT '家庭名称',
    invite_code            VARCHAR(8)   UNIQUE      COMMENT '邀请码（最长8位字母数字）',
    invite_code_role       VARCHAR(20)              COMMENT '邀请码绑定的目标角色：parent | child，加入者角色由此决定',
    invite_code_expires_at TIMESTAMP                COMMENT '邀请码过期时间（24小时）',
    invite_code_used_at    TIMESTAMP                COMMENT '邀请码使用时间，不为NULL即已使用（一次性）',
    created_by             VARCHAR(36)  NOT NULL    COMMENT '创建者user_id',
    status                 VARCHAR(20)  DEFAULT 'active',
    created_at             TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at             TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_invite_code (invite_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
