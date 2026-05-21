const crypto = require('crypto');

class UserActivityEvent {
  static EVENT_TYPES = {
    APP_FIRST_SEEN: 'app_first_seen',
    FAMILY_CREATED: 'family_created',
    FAMILY_JOINED: 'family_joined',
    TASK_CREATED: 'task_created',
    REWARD_CREATED: 'reward_created',
    TASK_COMPLETED: 'task_completed',
    NO_FAMILY_HOME_ONBOARDING_SHOWN: 'no_family_home_onboarding_shown',
    NO_FAMILY_HOME_ONBOARDING_PRIMARY_CLICKED: 'no_family_home_onboarding_primary_clicked',
    NO_FAMILY_HOME_ONBOARDING_SECONDARY_CLICKED: 'no_family_home_onboarding_secondary_clicked',
    RELEASE_NOTE_VIEWED: 'release_note_viewed',
    ABOUT_RELEASE_NOTES_OPENED: 'about_release_notes_opened',
    HELP_FEEDBACK_OPENED: 'help_feedback_opened'
  };

  static CLIENT_EVENT_TYPES = new Set([
    UserActivityEvent.EVENT_TYPES.NO_FAMILY_HOME_ONBOARDING_SHOWN,
    UserActivityEvent.EVENT_TYPES.NO_FAMILY_HOME_ONBOARDING_PRIMARY_CLICKED,
    UserActivityEvent.EVENT_TYPES.NO_FAMILY_HOME_ONBOARDING_SECONDARY_CLICKED,
    UserActivityEvent.EVENT_TYPES.RELEASE_NOTE_VIEWED,
    UserActivityEvent.EVENT_TYPES.ABOUT_RELEASE_NOTES_OPENED,
    UserActivityEvent.EVENT_TYPES.HELP_FEEDBACK_OPENED
  ]);

  constructor({
    eventId,
    userId,
    familyId = null,
    eventType,
    eventTime,
    appVersion = null,
    clientPlatform = null,
    clientEnv = null,
    sourcePage = null,
    targetUserId = null,
    payloadJson = null,
    createdAt = null
  } = {}) {
    this.eventId = eventId || UserActivityEvent.generateId();
    this.userId = userId;
    this.familyId = familyId || null;
    this.eventType = String(eventType || '').trim();
    this.eventTime = Number(eventTime || 0) || Date.now();
    this.appVersion = appVersion ? String(appVersion).trim() : null;
    this.clientPlatform = clientPlatform ? String(clientPlatform).trim() : null;
    this.clientEnv = clientEnv ? String(clientEnv).trim() : null;
    this.sourcePage = sourcePage ? String(sourcePage).trim() : null;
    this.targetUserId = targetUserId || null;
    this.payloadJson = payloadJson && typeof payloadJson === 'object'
      ? payloadJson
      : null;
    this.createdAt = createdAt || null;
  }

  static generateId() {
    return crypto.randomBytes(16).toString('hex');
  }

  static fromDB(record = {}) {
    let payloadJson = null;
    if (record.payload_json) {
      try {
        payloadJson = typeof record.payload_json === 'string'
          ? JSON.parse(record.payload_json)
          : record.payload_json;
      } catch (error) {
        payloadJson = null;
      }
    }

    return new UserActivityEvent({
      eventId: record.event_id,
      userId: record.user_id,
      familyId: record.family_id,
      eventType: record.event_type,
      eventTime: record.event_time,
      appVersion: record.app_version,
      clientPlatform: record.client_platform,
      clientEnv: record.client_env,
      sourcePage: record.source_page,
      targetUserId: record.target_user_id,
      payloadJson,
      createdAt: record.created_at
    });
  }

  toDB() {
    return {
      event_id: this.eventId,
      user_id: this.userId,
      family_id: this.familyId,
      event_type: this.eventType,
      event_time: this.eventTime,
      app_version: this.appVersion,
      client_platform: this.clientPlatform,
      client_env: this.clientEnv,
      source_page: this.sourcePage,
      target_user_id: this.targetUserId,
      payload_json: this.payloadJson ? JSON.stringify(this.payloadJson) : null
    };
  }

  toJSON() {
    return {
      eventId: this.eventId,
      userId: this.userId,
      familyId: this.familyId,
      eventType: this.eventType,
      eventTime: this.eventTime,
      appVersion: this.appVersion,
      clientPlatform: this.clientPlatform,
      clientEnv: this.clientEnv,
      sourcePage: this.sourcePage,
      targetUserId: this.targetUserId,
      payloadJson: this.payloadJson,
      createdAt: this.createdAt
    };
  }
}

module.exports = UserActivityEvent;
