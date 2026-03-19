-- 里程碑06：为 users 表添加家庭相关字段
-- backend/database/migrations/004_update_users_for_family.sql

-- 1. openid 改为可空（虚拟成员无 openid）
ALTER TABLE users MODIFY COLUMN openid VARCHAR(64) COMMENT '微信openid，虚拟成员为NULL';

-- 2. 新增字段
ALTER TABLE users
    ADD COLUMN family_id          VARCHAR(36) COMMENT '所属家庭ID，NULL表示未加入家庭',
    ADD COLUMN is_virtual         BOOLEAN     DEFAULT FALSE COMMENT '是否虚拟成员（无独立微信号，由家长创建）',
    ADD COLUMN created_by_user_id VARCHAR(36) COMMENT '虚拟成员的创建者user_id',
    ADD INDEX idx_family_id (family_id),
    ADD CONSTRAINT fk_users_family
        FOREIGN KEY (family_id) REFERENCES families(family_id) ON DELETE SET NULL;
