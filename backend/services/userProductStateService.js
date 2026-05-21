const { query, execute } = require('../config/database');
const UserProductState = require('../models/UserProductState');
const UserActivityEvent = require('../models/UserActivityEvent');
const { createLogger } = require('../utils/logger');

const logger = createLogger('UserProductStateService');

const DEFAULT_BASELINE_VERSION = 'm22q-baseline';
const CURRENT_UPDATE = 'current_update';
const RECENT_CHANGES = 'recent_changes';
const NO_FAMILY_ONBOARDING_MODE_NONE = 'none';
const NO_FAMILY_ONBOARDING_MODE_PARENT = 'parent_create_or_join';
const NO_FAMILY_ONBOARDING_MODE_CHILD = 'child_join_only';

function getQueryRunner(connection = null) {
  if (connection && typeof connection.execute === 'function') {
    return async (sql, params = []) => {
      const [rows] = await connection.execute(sql, params);
      return rows;
    };
  }

  return query;
}

function getExecuteRunner(connection = null) {
  if (connection && typeof connection.execute === 'function') {
    return async (sql, params = []) => {
      const [result] = await connection.execute(sql, params);
      return result;
    };
  }

  return execute;
}

function normalizeVersion(version) {
  const trimmed = String(version || '').trim();
  return trimmed || DEFAULT_BASELINE_VERSION;
}

function normalizePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const normalized = {};
  Object.keys(payload).forEach((key) => {
    const value = payload[key];
    if (value === undefined) {
      return;
    }
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      normalized[key] = value;
    }
  });

  return Object.keys(normalized).length ? normalized : null;
}

function compareVersion(left, right) {
  const normalizedLeft = String(left || '').trim();
  const normalizedRight = String(right || '').trim();

  if (!normalizedLeft && !normalizedRight) {
    return 0;
  }
  if (!normalizedLeft) {
    return -1;
  }
  if (!normalizedRight) {
    return 1;
  }

  const leftParts = String(left || '').split('.').map((part) => Number(part) || 0);
  const rightParts = String(right || '').split('.').map((part) => Number(part) || 0);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftParts[index] || 0;
    const rightValue = rightParts[index] || 0;
    if (leftValue > rightValue) {
      return 1;
    }
    if (leftValue < rightValue) {
      return -1;
    }
  }

  return 0;
}

class UserProductStateService {
  async getByUserId(userId, options = {}) {
    if (!userId) {
      return null;
    }

    const queryRunner = getQueryRunner(options.connection);
    const rows = await queryRunner(
      `SELECT *
         FROM user_product_state
        WHERE user_id = ?
        LIMIT 1${options.forUpdate ? ' FOR UPDATE' : ''}`,
      [userId]
    );

    if (!rows.length) {
      return null;
    }

    return UserProductState.fromDB(rows[0]);
  }

  async recordEvent(eventData = {}, options = {}) {
    if (!eventData.userId || !eventData.eventType) {
      throw Object.assign(new Error('事件参数不完整'), {
        code: 'INVALID_PARAMS'
      });
    }

    const event = new UserActivityEvent({
      ...eventData,
      appVersion: normalizeVersion(eventData.appVersion),
      payloadJson: normalizePayload(eventData.payloadJson)
    });
    const dbData = event.toDB();
    const executeRunner = getExecuteRunner(options.connection);

    await executeRunner(
      `INSERT INTO user_activity_events (
        event_id, user_id, family_id, event_type, event_time, app_version,
        client_platform, client_env, source_page, target_user_id, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dbData.event_id,
        dbData.user_id,
        dbData.family_id,
        dbData.event_type,
        dbData.event_time,
        dbData.app_version,
        dbData.client_platform,
        dbData.client_env,
        dbData.source_page,
        dbData.target_user_id,
        dbData.payload_json
      ]
    );

    return event;
  }

  async hasCurrentVersionEvent(userId, eventType, appVersion, options = {}) {
    if (!userId || !eventType || !appVersion) {
      return false;
    }

    const queryRunner = getQueryRunner(options.connection);
    const rows = await queryRunner(
      `SELECT event_id
         FROM user_activity_events
        WHERE user_id = ?
          AND event_type = ?
          AND app_version = ?
        LIMIT 1`,
      [userId, eventType, normalizeVersion(appVersion)]
    );

    return Array.isArray(rows) && rows.length > 0;
  }

  async ensureState(userId, options = {}) {
    if (!userId) {
      throw Object.assign(new Error('用户标识不能为空'), {
        code: 'INVALID_PARAMS'
      });
    }

    const runtimeVersion = normalizeVersion(options.runtimeVersion);
    const now = Number(options.now || Date.now());
    const executeRunner = getExecuteRunner(options.connection);
    const upsertResult = await executeRunner(
      `INSERT INTO user_product_state (
        user_id,
        first_seen_app_version,
        first_seen_at,
        last_seen_app_version,
        last_seen_at
      ) VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        last_seen_app_version = VALUES(last_seen_app_version),
        last_seen_at = VALUES(last_seen_at),
        updated_at = CURRENT_TIMESTAMP`,
      [userId, runtimeVersion, now, runtimeVersion, now]
    );

    if (Number(upsertResult?.affectedRows || 0) === 1) {
      await this.recordEvent({
        userId,
        familyId: options.familyId || null,
        eventType: UserActivityEvent.EVENT_TYPES.APP_FIRST_SEEN,
        eventTime: now,
        appVersion: runtimeVersion,
        clientPlatform: options.clientPlatform || null,
        clientEnv: options.clientEnv || null,
        sourcePage: options.sourcePage || null,
        payloadJson: options.payloadJson || null
      }, {
        connection: options.connection
      });

      logger.info('创建用户产品状态成功', {
        userId,
        runtimeVersion
      });
    }

    return this.getByUserId(userId, {
      connection: options.connection
    });
  }

  async markActivated(userId, options = {}) {
    if (!userId) {
      throw Object.assign(new Error('用户标识不能为空'), {
        code: 'INVALID_PARAMS'
      });
    }

    const runtimeVersion = normalizeVersion(options.runtimeVersion);
    const now = Number(options.now || Date.now());
    const state = await this.ensureState(userId, {
      connection: options.connection,
      runtimeVersion,
      familyId: options.familyId || null,
      clientPlatform: options.clientPlatform || null,
      clientEnv: options.clientEnv || null,
      sourcePage: options.sourcePage || null,
      payloadJson: options.payloadJson || null,
      forUpdate: true,
      now
    });

    if (state?.activatedAt) {
      return state;
    }

    const executeRunner = getExecuteRunner(options.connection);
    await executeRunner(
      `UPDATE user_product_state
          SET activated_at = ?,
              activation_version = ?,
              activation_source = ?,
              updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
          AND activated_at IS NULL`,
      [
        now,
        runtimeVersion,
        String(options.source || '').trim() || 'unknown',
        userId
      ]
    );

    return this.getByUserId(userId, {
      connection: options.connection
    });
  }

  async getProductState(userId, options = {}) {
    const state = await this.ensureState(userId, {
      connection: options.connection,
      runtimeVersion: options.runtimeVersion,
      familyId: options.familyId || null,
      clientPlatform: options.clientPlatform || null,
      clientEnv: options.clientEnv || null,
      sourcePage: options.sourcePage || null,
      payloadJson: options.payloadJson || null,
      now: options.now || Date.now()
    });
    const runtimeVersion = normalizeVersion(options.runtimeVersion);
    const isUpgradeUser = compareVersion(runtimeVersion, state.firstSeenAppVersion) > 0;
    const isActivatedUser = Boolean(state.activatedAt);
    const isCurrentVersionBaseline = compareVersion(runtimeVersion, state.firstSeenAppVersion) === 0;
    const canAutoPrompt = isUpgradeUser && isActivatedUser;
    const userRole = String(options.userRole || '').trim();
    const familyId = options.familyId || null;
    const noFamilyOnboardingMode = !familyId
      ? (userRole === 'child' ? NO_FAMILY_ONBOARDING_MODE_CHILD : NO_FAMILY_ONBOARDING_MODE_PARENT)
      : NO_FAMILY_ONBOARDING_MODE_NONE;
    const hasShownNoFamilyHomeOnboardingInCurrentVersion = noFamilyOnboardingMode !== NO_FAMILY_ONBOARDING_MODE_NONE
      ? await this.hasCurrentVersionEvent(
        userId,
        UserActivityEvent.EVENT_TYPES.NO_FAMILY_HOME_ONBOARDING_SHOWN,
        runtimeVersion,
        { connection: options.connection }
      )
      : false;
    const canShowNoFamilyHomeOnboarding = Boolean(
      noFamilyOnboardingMode !== NO_FAMILY_ONBOARDING_MODE_NONE
      && isCurrentVersionBaseline
      && !isActivatedUser
      && !hasShownNoFamilyHomeOnboardingInCurrentVersion
    );

    return {
      userId,
      firstSeenAppVersion: state.firstSeenAppVersion,
      firstSeenAt: state.firstSeenAt,
      activatedAt: state.activatedAt,
      activationVersion: state.activationVersion,
      activationSource: state.activationSource,
      lastSeenAppVersion: state.lastSeenAppVersion,
      lastSeenAt: state.lastSeenAt,
      isCurrentVersionBaseline,
      isUpgradeUser,
      isActivatedUser,
      canAutoPrompt,
      canShowHelpBadge: canAutoPrompt,
      aboutEntryMode: canAutoPrompt ? CURRENT_UPDATE : RECENT_CHANGES,
      canShowNoFamilyHomeOnboarding,
      hasShownNoFamilyHomeOnboardingInCurrentVersion,
      noFamilyOnboardingMode
    };
  }

  async getReleaseNoteAwarenessState(userId, options = {}) {
    return this.getProductState(userId, options);
  }
}

module.exports = new UserProductStateService();
module.exports.compareVersion = compareVersion;
module.exports.normalizeVersion = normalizeVersion;
module.exports.DEFAULT_BASELINE_VERSION = DEFAULT_BASELINE_VERSION;
module.exports.CURRENT_UPDATE = CURRENT_UPDATE;
module.exports.RECENT_CHANGES = RECENT_CHANGES;
module.exports.NO_FAMILY_ONBOARDING_MODE_NONE = NO_FAMILY_ONBOARDING_MODE_NONE;
module.exports.NO_FAMILY_ONBOARDING_MODE_PARENT = NO_FAMILY_ONBOARDING_MODE_PARENT;
module.exports.NO_FAMILY_ONBOARDING_MODE_CHILD = NO_FAMILY_ONBOARDING_MODE_CHILD;
