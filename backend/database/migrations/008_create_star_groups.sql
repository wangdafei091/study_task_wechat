CREATE TABLE IF NOT EXISTS star_groups (
  group_id VARCHAR(100) PRIMARY KEY,
  user_id VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL,
  stars INT DEFAULT 0,
  expiry_date VARCHAR(20) DEFAULT NULL,
  modify_time BIGINT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_star_groups_user_id (user_id),
  INDEX idx_star_groups_user_type (user_id, type),
  UNIQUE KEY uk_star_groups_user_type_expiry (user_id, type, expiry_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
