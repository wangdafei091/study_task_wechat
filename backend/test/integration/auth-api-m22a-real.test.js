const fs = require('fs');
const path = require('path');
const request = require('supertest');
const express = require('express');

jest.mock('../../utils/wechat', () => ({
  code2Session: jest.fn()
}));

const db = require('../../config/database');
const authRoutes = require('../../routes/auth');
const { code2Session } = require('../../utils/wechat');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

async function ensureAuthTables() {
  const migrationFiles = [
    '../../database/migrations/016_create_app_access_codes.sql'
  ];

  for (const relativeFile of migrationFiles) {
    const sql = fs.readFileSync(path.join(__dirname, relativeFile), 'utf8').trim();
    await db.query(sql);
  }
}

async function cleanupTestData() {
  await db.query("DELETE FROM app_access_codes WHERE access_code_id LIKE 'm22a_auth_%' OR code LIKE 'M22A%'");
  await db.query("DELETE FROM users WHERE user_id LIKE 'm22a_auth_%' OR openid LIKE 'm22a_auth_%'");
}

describe('M22A auth API 真实数据库集成测试', () => {
  const previousAccessMode = process.env.APP_ACCESS_MODE;

  beforeAll(async () => {
    await db.testConnection();
    await ensureAuthTables();
  }, 30000);

  beforeEach(async () => {
    process.env.APP_ACCESS_MODE = 'invite_only';
    jest.clearAllMocks();
    await cleanupTestData();
  });

  afterAll(async () => {
    process.env.APP_ACCESS_MODE = previousAccessMode;
    await cleanupTestData();
    await db.closePool();
  });

  it('invite_only 下新用户缺少邀请码应返回 AUTH_APP_ACCESS_CODE_REQUIRED', async () => {
    code2Session.mockResolvedValue({
      openid: 'm22a_auth_openid_required',
      unionid: 'm22a_auth_union_required'
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ code: 'wx-required' });

    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe('AUTH_APP_ACCESS_CODE_REQUIRED');
  });

  it('invite_only 下新用户邀请码无效应返回 AUTH_APP_ACCESS_CODE_INVALID', async () => {
    code2Session.mockResolvedValue({
      openid: 'm22a_auth_openid_invalid',
      unionid: 'm22a_auth_union_invalid'
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ code: 'wx-invalid', accessCode: 'M22ABAD1' });

    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe('AUTH_APP_ACCESS_CODE_INVALID');
  });

  it('invite_only 下有效邀请码应允许新用户创建并消费邀请码', async () => {
    code2Session.mockResolvedValue({
      openid: 'm22a_auth_openid_success',
      unionid: 'm22a_auth_union_success'
    });
    await db.query(
      `INSERT INTO app_access_codes
       (access_code_id, code, status, max_uses, used_count, expires_at, note)
       VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY), ?)`,
      ['m22a_auth_code_success', 'M22AOK01', 'active', 1, 0, 'integration']
    );

    const res = await request(app)
      .post('/api/auth/login')
      .send({ code: 'wx-success', accessCode: 'M22AOK01' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.openid).toBe('m22a_auth_openid_success');

    const codeRows = await db.query(
      'SELECT used_count, status, bound_user_id FROM app_access_codes WHERE access_code_id = ?',
      ['m22a_auth_code_success']
    );
    expect(codeRows[0].used_count).toBe(1);
    expect(codeRows[0].status).toBe('consumed');
    expect(codeRows[0].bound_user_id).toBeTruthy();
  });

  it('invite_only 下已有用户应直接放行，不校验邀请码', async () => {
    code2Session.mockResolvedValue({
      openid: 'm22a_auth_openid_existing',
      unionid: 'm22a_auth_union_existing'
    });
    await db.query(
      `INSERT INTO users
       (user_id, openid, unionid, nickname, avatar, role, status, family_id, family_permission_role, is_virtual, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['m22a_auth_user_existing', 'm22a_auth_openid_existing', 'm22a_auth_union_existing', '已有用户', '', 'parent', 'active', null, null, 0, null]
    );

    const res = await request(app)
      .post('/api/auth/login')
      .send({ code: 'wx-existing' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.userId).toBe('m22a_auth_user_existing');
  });
});
