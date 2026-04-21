-- 里程碑22A：为 users 表增加家庭内权限字段

ALTER TABLE users
  ADD COLUMN family_permission_role VARCHAR(20) DEFAULT NULL COMMENT '家庭内权限：manager/viewer，非家庭家长和孩子为NULL' AFTER family_id;

UPDATE users
SET family_permission_role = 'manager'
WHERE role = 'parent'
  AND family_id IS NOT NULL
  AND status = 'active'
  AND family_permission_role IS NULL;
