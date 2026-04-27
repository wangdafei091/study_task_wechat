const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

const db = require('../../config/database');
const familyRoutes = require('../../routes/families');
const { authMiddleware } = require('../../middleware/auth');

const app = express();
app.use(express.json());
app.use('/api/families', authMiddleware, familyRoutes);

function generateToken(user) {
  const secret = process.env.JWT_SECRET || 'test-secret-key-for-dev-testing-only';
  return jwt.sign(
    {
      userId: user.user_id,
      openid: user.openid,
      role: user.role,
      familyId: user.family_id,
      familyPermissionRole: user.family_permission_role || null
    },
    secret,
    { expiresIn: '1h' }
  );
}

async function cleanupTestData() {
  await db.query("DELETE FROM users WHERE user_id LIKE 'm22a_family_%'");
  await db.query("DELETE FROM families WHERE family_id LIKE 'm22a_family_%'");
}

async function setupTestData() {
  await cleanupTestData();

  await db.query(
    `INSERT INTO users (user_id, openid, nickname, avatar, role, status, family_id, family_permission_role, is_virtual, created_by_user_id) VALUES
      ('m22a_family_parent_manager', 'm22a_family_parent_manager_openid', 'M22A管理员', NULL, 'parent', 'active', NULL, NULL, 0, NULL),
      ('m22a_family_parent_viewer', 'm22a_family_parent_viewer_openid', 'M22A查看者', NULL, 'parent', 'active', NULL, NULL, 0, NULL)`
  );

  await db.query(
    `INSERT INTO families (family_id, name, invite_code, invite_code_role, created_by, status) VALUES
      ('m22a_family_001', 'M22A家庭', 'M22AF001', 'child', 'm22a_family_parent_manager', 'active')`
  );

  await db.query(
    `UPDATE users
     SET family_id = 'm22a_family_001',
         family_permission_role = CASE
           WHEN user_id = 'm22a_family_parent_manager' THEN 'manager'
           WHEN user_id = 'm22a_family_parent_viewer' THEN 'viewer'
           ELSE family_permission_role
         END
     WHERE user_id IN ('m22a_family_parent_manager', 'm22a_family_parent_viewer')`
  );
}

describe('M22A families API 真实数据库集成测试', () => {
  let viewerToken;

  beforeAll(async () => {
    await db.testConnection();
    await setupTestData();

    viewerToken = generateToken({
      user_id: 'm22a_family_parent_viewer',
      openid: 'm22a_family_parent_viewer_openid',
      role: 'parent',
      family_id: 'm22a_family_001',
      family_permission_role: 'viewer'
    });
  }, 30000);

  afterAll(async () => {
    await cleanupTestData();
    await db.closePool();
  });

  it('viewer 刷新邀请码应返回 403 FAMILY_MANAGER_REQUIRED', async () => {
    const res = await request(app)
      .post('/api/families/current/invite-code')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ role: 'child' });

    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('FAMILY_MANAGER_REQUIRED');
  });

  it('viewer 创建虚拟成员应返回 403 FAMILY_MANAGER_REQUIRED', async () => {
    const res = await request(app)
      .post('/api/families/members')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ name: '越权孩子' });

    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('FAMILY_MANAGER_REQUIRED');
  });
});
