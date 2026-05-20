CREATE TABLE IF NOT EXISTS user_product_state (
  user_id VARCHAR(36) PRIMARY KEY,
  first_seen_app_version VARCHAR(32) NOT NULL,
  first_seen_at BIGINT NOT NULL,
  activated_at BIGINT DEFAULT NULL,
  activation_version VARCHAR(32) DEFAULT NULL,
  activation_source VARCHAR(64) DEFAULT NULL,
  last_seen_app_version VARCHAR(32) DEFAULT NULL,
  last_seen_at BIGINT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_product_state_last_seen_at (last_seen_at),
  INDEX idx_user_product_state_activation (activated_at),
  CONSTRAINT fk_user_product_state_user
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_activity_events (
  event_id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  family_id VARCHAR(36) DEFAULT NULL,
  event_type VARCHAR(64) NOT NULL,
  event_time BIGINT NOT NULL,
  app_version VARCHAR(32) DEFAULT NULL,
  client_platform VARCHAR(32) DEFAULT NULL,
  client_env VARCHAR(32) DEFAULT NULL,
  source_page VARCHAR(128) DEFAULT NULL,
  target_user_id VARCHAR(36) DEFAULT NULL,
  payload_json JSON DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_activity_events_user_time (user_id, event_time),
  INDEX idx_user_activity_events_type_time (event_type, event_time),
  CONSTRAINT fk_user_activity_events_user
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_user_activity_events_target_user
    FOREIGN KEY (target_user_id) REFERENCES users(user_id) ON DELETE SET NULL,
  CONSTRAINT fk_user_activity_events_family
    FOREIGN KEY (family_id) REFERENCES families(family_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
