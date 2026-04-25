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

async function ensureM22bTables() {
  const statements = fs
    .readFileSync(path.join(__dirname, '../../database/migrations/017_add_system_admin_and_settings.sql'), 'utf8')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);

  for (const statement of statements) {
    try {
      await db.query(statement);
    } catch (error) {
      if (!String(error.message || '').includes('Duplicate column name')) {
        throw error;
      }
    }
  }
}

async function cleanupTestData() {
  await db.query("DELETE FROM system_settings WHERE setting_key = 'app_access_mode'");
  await db.query("DELETE FROM users WHERE user_id LIKE 'm22b_auth_%' OR openid LIKE 'm22b_auth_%'");
}

describe('M22B auth API 动态准入真实数据库集成测试', () => {
  beforeAll(async () => {
    await db.testConnection();
    await ensureM22bTables();
  }, 30000);

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env.APP_ACCESS_MODE;
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await db.closePool();
  });

  it('数据库配置为 open 时新用户无需邀请码', async () => {
    code2Session.mockResolvedValue({
      openid: 'm22b_auth_openid_open',
      unionid: 'm22b_auth_union_open'
    });
    await db.query(
      'INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)',
      ['app_access_mode', 'open']
    );

    const res = await request(app)
      .post('/api/auth/login')
      .send({ code: 'wx-open' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.openid).toBe('m22b_auth_openid_open');
  });

  it('数据库配置为 invite_only 时新用户缺少邀请码应被拦截', async () => {
    code2Session.mockResolvedValue({
      openid: 'm22b_auth_openid_invite',
      unionid: 'm22b_auth_union_invite'
    });
    await db.query(
      'INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)',
      ['app_access_mode', 'invite_only']
    );

    const res = await request(app)
      .post('/api/auth/login')
      .send({ code: 'wx-invite' });

    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe('AUTH_APP_ACCESS_CODE_REQUIRED');
  });
});
