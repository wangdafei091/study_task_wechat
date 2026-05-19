const ReleaseNoteRepository = require('../repositories/release-note-repository');
const appMeta = require('../utils/app-meta');
const logger = require('../utils/logger');
const userContextUtils = require('../utils/user-context');
const runtimeVersionUtils = require('../utils/runtime-version');

class ReleaseNoteService {
  constructor(options = {}) {
    this.repository = options.repository || new ReleaseNoteRepository(options.storageAdapter, options.repositoryOptions);
    this.userService = options.userService || null;
    this.appMeta = options.appMeta || appMeta;
  }

  updateUserService(userService) {
    this.userService = userService || null;
  }

  _buildContext(context = {}) {
    const loginUser = context.loginUser || this.userService?.getLoginUser?.() || null;
    const currentUser = context.currentUser || this.userService?.getCurrentUser?.() || loginUser || null;
    const runtimeVersion = String(
      context.runtimeVersion ||
      runtimeVersionUtils.getRuntimeVersion() ||
      this.appMeta.version ||
      ''
    ).trim();

    return {
      loginUser,
      currentUser,
      runtimeVersion
    };
  }

  _getEffectiveUserId(context = {}) {
    return userContextUtils.getUserIdentifier(context.currentUser)
      || userContextUtils.getUserIdentifier(context.loginUser)
      || '';
  }

  async getCurrentReleaseNote(context = {}) {
    try {
      const resolvedContext = this._buildContext(context);
      const runtimeVersion = resolvedContext.runtimeVersion;
      if (!runtimeVersion) {
        return {
          success: true,
          note: null,
          unread: false,
          promptEligible: false,
          effectiveUserId: ''
        };
      }

      const note = await this.repository.findByVersion(runtimeVersion);
      if (!note || !note.matchesAudience(resolvedContext)) {
        return {
          success: true,
          note: null,
          unread: false,
          promptEligible: false,
          effectiveUserId: this._getEffectiveUserId(resolvedContext)
        };
      }

      const effectiveUserId = this._getEffectiveUserId(resolvedContext);
      const readState = await this.repository.getReadState(runtimeVersion, effectiveUserId);
      const unread = !readState.readAt;
      const promptEligible = unread && !readState.promptShownAt;

      return {
        success: true,
        note: note.toJSON(),
        unread,
        promptEligible,
        effectiveUserId
      };
    } catch (error) {
      logger.error('ReleaseNoteService', '获取当前版本说明失败', error);
      return {
        success: false,
        note: null,
        unread: false,
        promptEligible: false,
        effectiveUserId: ''
      };
    }
  }

  async listVisibleReleaseNotes(context = {}) {
    try {
      const resolvedContext = this._buildContext(context);
      const notes = await this.repository.getAllNotes();
      const visibleNotes = notes
        .filter((item) => item.matchesAudience(resolvedContext))
        .map((item) => item.toJSON());

      return {
        success: true,
        notes: visibleNotes
      };
    } catch (error) {
      logger.error('ReleaseNoteService', '获取可见版本说明列表失败', error);
      return {
        success: false,
        notes: []
      };
    }
  }

  async markPromptShown(version, effectiveUserId) {
    try {
      const result = await this.repository.saveReadState(version, effectiveUserId, {
        promptShownAt: Date.now()
      });
      return {
        success: result.success === true
      };
    } catch (error) {
      logger.error('ReleaseNoteService', '标记版本提示已展示失败', error);
      return {
        success: false
      };
    }
  }

  async markReleaseNoteRead(version, effectiveUserId) {
    try {
      const now = Date.now();
      const result = await this.repository.saveReadState(version, effectiveUserId, {
        promptShownAt: now,
        readAt: now
      });
      return {
        success: result.success === true
      };
    } catch (error) {
      logger.error('ReleaseNoteService', '标记版本说明已读失败', error);
      return {
        success: false
      };
    }
  }

  async getHelpEntryBadgeState(context = {}) {
    const result = await this.getCurrentReleaseNote(context);
    if (!result.success || !result.note || !result.unread) {
      return {
        visible: false,
        text: ''
      };
    }

    return {
      visible: true,
      text: '有新变化'
    };
  }

  evaluateReleaseNotePromptDisplay(pageState = {}) {
    const blocked = Boolean(
      pageState.showSearch
      || pageState.showMessagePreview
      || pageState.showHomeOnboardingCard
      || pageState.showUserSwitcher
    );

    return {
      shouldDisplay: !blocked,
      pending: blocked
    };
  }
}

module.exports = ReleaseNoteService;
