-- 测试数据库初始化脚本（兼容版本）
-- 执行前请确保已创建测试数据库: CREATE DATABASE task_wechat_test;
-- 此版本兼容MySQL 5.5+，使用TEXT替代JSON类型

USE task_wechat_test;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS families;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

-- 创建测试用户表
CREATE TABLE IF NOT EXISTS users (
  user_id VARCHAR(36) PRIMARY KEY COMMENT '用户ID，UUID',
  openid VARCHAR(64) UNIQUE DEFAULT NULL COMMENT '微信openid，虚拟成员为NULL',
  unionid VARCHAR(64) DEFAULT NULL COMMENT '微信unionid（可选）',
  nickname VARCHAR(100) DEFAULT NULL COMMENT '昵称',
  avatar VARCHAR(255) DEFAULT NULL COMMENT '头像URL',
  role VARCHAR(20) DEFAULT 'parent' COMMENT '角色：parent/child',
  status VARCHAR(20) DEFAULT 'active' COMMENT '状态：active/inactive',
  family_id VARCHAR(36) DEFAULT NULL COMMENT '所属家庭ID，NULL表示未加入家庭',
  is_virtual TINYINT(1) DEFAULT 0 COMMENT '是否虚拟成员（无独立微信号，由家长创建）',
  created_by_user_id VARCHAR(36) DEFAULT NULL COMMENT '虚拟成员的创建者user_id',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_family_id (family_id),
  INDEX idx_openid (openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

-- 创建测试家庭表
CREATE TABLE IF NOT EXISTS families (
  family_id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL COMMENT '家庭名称',
  invite_code VARCHAR(8) UNIQUE COMMENT '邀请码（最长8位字母数字）',
  invite_code_role VARCHAR(20) DEFAULT NULL COMMENT '邀请码绑定的目标角色：parent | child',
  invite_code_expires_at TIMESTAMP NULL DEFAULT NULL COMMENT '邀请码过期时间（24小时）',
  invite_code_used_at TIMESTAMP NULL DEFAULT NULL COMMENT '邀请码使用时间，不为NULL即已使用（一次性）',
  created_by VARCHAR(36) NOT NULL COMMENT '创建者user_id',
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_invite_code (invite_code),
  CONSTRAINT fk_families_created_by FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE users
  ADD CONSTRAINT fk_users_family FOREIGN KEY (family_id) REFERENCES families(family_id) ON DELETE SET NULL;

-- 创建测试任务表（兼容版本）
-- 修复：1. repeat 是保留关键字，使用反引号；2. JSON改为TEXT兼容旧版本
CREATE TABLE IF NOT EXISTS tasks (
  task_id VARCHAR(50) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  type ENUM('study', 'habit', 'interest') NOT NULL DEFAULT 'study',
  date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  duration INT DEFAULT 0 COMMENT '时长（分钟）',
  is_all_day TINYINT(1) DEFAULT 0,
  is_required TINYINT(1) DEFAULT 0,
  penalty_applied TINYINT(1) DEFAULT 0,
  points INT DEFAULT 0,
  points_expiry ENUM('1day', '7day', '30day', 'permanent') DEFAULT 'permanent',
  status INT DEFAULT 0 COMMENT '0=未完成, 1=已完成',
  `repeat` TEXT COMMENT '重复任务配置（JSON字符串）',
  has_no_end_date TINYINT(1) DEFAULT 0,
  tags TEXT COMMENT '标签数组（JSON字符串）',
  completion_time BIGINT DEFAULT NULL COMMENT 'epoch ms',
  star_awarded TINYINT(1) DEFAULT 0,
  modify_time BIGINT DEFAULT NULL COMMENT 'epoch ms',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_date (date),
  INDEX idx_status (status),
  INDEX idx_deleted_at (deleted_at),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 插入测试数据
-- 先创建家长，再创建家庭，最后回填 family_id，避免循环外键插入失败
INSERT INTO users (user_id, openid, nickname, avatar, role, status, family_id, is_virtual, created_by_user_id) VALUES
('parent_001', 'parent_openid_001', '测试家长', NULL, 'parent', 'active', NULL, 0, NULL),
('parent_002', 'parent_openid_002', '测试家长2', NULL, 'parent', 'active', NULL, 0, NULL);

-- 家庭1：包含家长和孩子
INSERT INTO families (family_id, name, invite_code, invite_code_role, created_by, status) VALUES
('family_001', '测试家庭A', 'TEST001', 'child', 'parent_001', 'active');

-- 家庭2：用于跨家庭测试
INSERT INTO families (family_id, name, invite_code, invite_code_role, created_by, status) VALUES
('family_002', '测试家庭B', 'TEST002', 'child', 'parent_002', 'active');

UPDATE users SET family_id = 'family_001' WHERE user_id = 'parent_001';
UPDATE users SET family_id = 'family_002' WHERE user_id = 'parent_002';

INSERT INTO users (user_id, openid, nickname, avatar, role, status, family_id, is_virtual, created_by_user_id) VALUES
('child_001', 'child_openid_001', '测试孩子', NULL, 'child', 'active', 'family_001', 0, NULL),
('child_002', 'child_openid_002', '测试孩子2', NULL, 'child', 'active', 'family_001', 0, NULL),
('child_003', 'child_openid_003', '测试孩子3', NULL, 'child', 'active', 'family_002', 0, NULL);

-- 任务测试数据
INSERT INTO tasks (task_id, user_id, title, type, date, points, status, star_awarded) VALUES
('task_001', 'child_001', '完成数学作业', 'study', CURDATE(), 5, 0, 0),
('task_002', 'child_001', '阅读英语文章', 'study', CURDATE(), 3, 1, 1),
('task_003', 'child_002', '练习书法', 'habit', CURDATE(), 2, 0, 0),
('task_004', 'child_003', '完成科学实验', 'study', CURDATE(), 4, 0, 0);

-- 软删除测试任务
INSERT INTO tasks (task_id, user_id, title, type, date, points, status, deleted_at) VALUES
('task_deleted_001', 'child_001', '已删除的任务', 'study', CURDATE(), 1, 0, NOW());

SELECT '✅ 测试数据库初始化完成！' as status;
SELECT '📊 数据统计：' as info;
SELECT CONCAT('用户数: ', COUNT(*)) as stat FROM users
UNION ALL
SELECT CONCAT('家庭数: ', COUNT(*)) FROM families
UNION ALL
SELECT CONCAT('任务数: ', COUNT(*)) FROM tasks;
