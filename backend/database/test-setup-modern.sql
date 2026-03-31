-- 测试数据库初始化脚本（现代版本）
-- 执行前请确保已创建测试数据库: CREATE DATABASE task_wechat_test;
-- 此版本适用于MySQL 5.7.7+，使用原生JSON类型

USE task_wechat_test;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS rewards;
DROP TABLE IF EXISTS star_groups;
DROP TABLE IF EXISTS star_records;
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

-- 创建测试任务表（现代版本，使用JSON类型）
-- 修复：repeat 是保留关键字，使用反引号括起来
CREATE TABLE IF NOT EXISTS tasks (
  task_id VARCHAR(50) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  type ENUM('study', 'habit', 'interest') NOT NULL DEFAULT 'study',
  date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  reminder JSON COMMENT '提醒配置',
  duration INT DEFAULT 0 COMMENT '时长（分钟）',
  is_all_day TINYINT(1) DEFAULT 0,
  is_required TINYINT(1) DEFAULT 0,
  penalty_applied TINYINT(1) DEFAULT 0,
  points INT DEFAULT 0,
  points_expiry VARCHAR(20) DEFAULT 'permanent',
  status INT DEFAULT 0 COMMENT '0=未完成, 1=已完成',
  `repeat` JSON COMMENT '重复任务配置',
  has_no_end_date TINYINT(1) DEFAULT 0,
  tags JSON COMMENT '标签数组',
  completion_time BIGINT DEFAULT NULL COMMENT 'epoch ms',
  star_awarded TINYINT(1) DEFAULT 0,
  modify_time BIGINT DEFAULT NULL COMMENT 'epoch ms',
  parent_task_id VARCHAR(100) DEFAULT NULL COMMENT '重复任务的父任务ID，普通任务为NULL',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_date (date),
  INDEX idx_status (status),
  INDEX idx_deleted_at (deleted_at),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS star_records (
  record_id VARCHAR(100) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  type ENUM('income', 'expense') NOT NULL,
  source VARCHAR(50) NOT NULL,
  source_id VARCHAR(100) DEFAULT NULL,
  points INT NOT NULL,
  description VARCHAR(255) DEFAULT NULL,
  expiry_type VARCHAR(50) DEFAULT NULL,
  expiry_date VARCHAR(20) DEFAULT NULL,
  balance INT DEFAULT 0,
  previous_balance INT DEFAULT 0,
  original_task_date VARCHAR(20) DEFAULT NULL,
  requested_points INT DEFAULT NULL,
  idempotency_key VARCHAR(150) DEFAULT NULL,
  data JSON DEFAULT NULL,
  modify_time BIGINT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  INDEX idx_star_records_user_id (user_id),
  INDEX idx_star_records_source_id (source_id),
  UNIQUE KEY uk_star_records_idempotency_key (idempotency_key),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS star_groups (
  group_id VARCHAR(100) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  type VARCHAR(50) NOT NULL,
  stars INT DEFAULT 0,
  expiry_date VARCHAR(20) DEFAULT NULL,
  modify_time BIGINT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_star_groups_user_id (user_id),
  UNIQUE KEY uk_star_groups_user_type_expiry (user_id, type, expiry_date),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rewards (
  reward_id VARCHAR(100) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  family_id VARCHAR(36) DEFAULT NULL,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(500) DEFAULT NULL,
  type VARCHAR(50) DEFAULT 'item',
  points INT NOT NULL,
  icon VARCHAR(50) DEFAULT NULL,
  enabled TINYINT(1) DEFAULT 1,
  claimed TINYINT(1) DEFAULT 0,
  claim_time BIGINT DEFAULT NULL,
  claim_status VARCHAR(50) DEFAULT 'available',
  delivery_time BIGINT DEFAULT NULL,
  exchange_user_id VARCHAR(36) DEFAULT NULL,
  is_example TINYINT(1) DEFAULT 0,
  tags JSON DEFAULT NULL,
  notes TEXT,
  protected_by_expiry TINYINT(1) DEFAULT 0,
  partial_protection INT DEFAULT 0,
  modify_time BIGINT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  INDEX idx_rewards_user_id (user_id),
  INDEX idx_rewards_family_id (family_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messages (
  message_id VARCHAR(100) PRIMARY KEY,
  family_id VARCHAR(100) DEFAULT NULL,
  user_id VARCHAR(100) DEFAULT NULL,
  actor_user_id VARCHAR(100) DEFAULT NULL,
  subject_user_id VARCHAR(100) DEFAULT NULL,
  operation_key VARCHAR(100) DEFAULT NULL,
  message_event_key VARCHAR(255) NOT NULL,
  visibility_scope VARCHAR(20) NOT NULL,
  type VARCHAR(50) NOT NULL,
  notification_type VARCHAR(50) NOT NULL,
  related_id VARCHAR(100) DEFAULT NULL,
  related_type VARCHAR(50) DEFAULT NULL,
  title VARCHAR(200) NOT NULL,
  summary VARCHAR(500) NOT NULL,
  content TEXT DEFAULT NULL,
  icon VARCHAR(50) DEFAULT NULL,
  priority TINYINT DEFAULT 1,
  is_read TINYINT(1) DEFAULT 0,
  read_time BIGINT DEFAULT NULL,
  is_archived TINYINT(1) DEFAULT 0,
  create_time BIGINT NOT NULL,
  deleted_at DATETIME DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_message_event_scope (message_event_key, visibility_scope),
  INDEX idx_messages_family_scope_time (family_id, visibility_scope, create_time),
  INDEX idx_messages_user_scope_time (user_id, visibility_scope, create_time),
  INDEX idx_messages_related (related_type, related_id),
  INDEX idx_messages_deleted_at (deleted_at)
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

INSERT INTO star_groups (group_id, user_id, type, stars, expiry_date, modify_time) VALUES
('group_test_week_001', 'child_001', 'week', 5, '2026-03-28', 1742400000000),
('group_test_month_001', 'child_001', 'month', 8, '2026-03-31', 1742400000001),
('group_test_perm_001', 'child_002', 'permanent', 10, NULL, 1742400000002);

INSERT INTO rewards (reward_id, user_id, family_id, name, description, type, points, enabled, claimed, claim_status, modify_time) VALUES
('reward_seed_001', 'parent_001', 'family_001', '周末看电影', '家庭奖励示例', 'activity', 8, 1, 0, 'available', 1742400000003);

SELECT '✅ 测试数据库初始化完成！（现代版本：JSON类型）' as status;
SELECT '📊 数据统计：' as info;
SELECT CONCAT('用户数: ', COUNT(*)) as stat FROM users
UNION ALL
SELECT CONCAT('家庭数: ', COUNT(*)) FROM families
UNION ALL
SELECT CONCAT('任务数: ', COUNT(*)) FROM tasks;
