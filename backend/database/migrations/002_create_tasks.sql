-- 文件：database/migrations/002_create_tasks.sql
-- 说明：创建任务表
-- 依赖：001_create_users.sql

CREATE TABLE IF NOT EXISTS tasks (
    task_id VARCHAR(36) PRIMARY KEY COMMENT '任务ID，UUID',
    user_id VARCHAR(36) NOT NULL COMMENT '用户ID',
    title VARCHAR(200) NOT NULL COMMENT '任务标题',
    description TEXT COMMENT '任务描述',
    type VARCHAR(20) NOT NULL COMMENT '类型：study/habit/interest',
    date DATE NOT NULL COMMENT '任务日期',
    startTime VARCHAR(10) COMMENT '开始时间 HH:mm',
    endTime VARCHAR(10) COMMENT '结束时间 HH:mm',
    points INT NOT NULL DEFAULT 0 COMMENT '奖励星星数',
    pointsExpiry VARCHAR(20) NOT NULL COMMENT '有效期类型：permanent/week/month/quarter',
    isRequired BOOLEAN DEFAULT FALSE COMMENT '是否必做任务',
    status INT DEFAULT 0 COMMENT '状态：0=未完成，1=已完成',
    `repeat` JSON COMMENT '重复配置',
    isAllDay BOOLEAN DEFAULT FALSE COMMENT '是否全天任务',
    penaltyApplied BOOLEAN DEFAULT FALSE COMMENT '是否已应用惩罚',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_user_date (user_id, date),
    INDEX idx_user_status (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='任务表';
