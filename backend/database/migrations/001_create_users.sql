-- 文件：database/migrations/001_create_users.sql
-- 说明：创建用户表
-- 依赖：无

CREATE TABLE IF NOT EXISTS users (
    user_id VARCHAR(36) PRIMARY KEY COMMENT '用户ID，UUID',
    openid VARCHAR(64) UNIQUE NOT NULL COMMENT '微信openid',
    unionid VARCHAR(64) COMMENT '微信unionid（可选）',
    nickname VARCHAR(100) COMMENT '昵称',
    avatar VARCHAR(255) COMMENT '头像URL',
    role VARCHAR(20) DEFAULT 'parent' COMMENT '角色：parent/child',
    status VARCHAR(20) DEFAULT 'active' COMMENT '状态：active/inactive',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_openid (openid),
    INDEX idx_unionid (unionid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';
