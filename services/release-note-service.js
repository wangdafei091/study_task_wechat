const ReleaseNoteRepository = require('../repositories/release-note-repository');
const API_CONFIG = require('../utils/api-config');
const HttpClient = require('../utils/http-client');
const appMeta = require('../utils/app-meta');
const logger = require('../utils/logger');
const miniProgramEnv = require('../utils/mini-program-env');
const userContextUtils = require('../utils/user-context');
const runtimeVersionUtils = require('../utils/runtime-version');

const ABOUT_ENTRY_MODE_CURRENT_UPDATE = 'current_update';
const ABOUT_ENTRY_MODE_RECENT_CHANGES = 'recent_changes';

class ReleaseNoteService {
  constructor(options = {}) {
    this.repository = options.repository || new ReleaseNoteRepository(options.storageAdapter, options.repositoryOptions);
    this.userService = options.userService || null;
    this.appMeta = options.appMeta || appMeta;
    this.httpClient = options.httpClient || HttpClient;
    this.apiConfig = options.apiConfig || API_CONFIG;
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
      runtimeVersion,
      clientEnv: context.clientEnv || miniProgramEnv.getEnvVersion(),
      sourcePage: String(context.sourcePage || '').trim() || null
    };
  }

  _getEffectiveUserId(context = {}) {
    return userContextUtils.getUserIdentifier(context.currentUser)
      || userContextUtils.getUserIdentifier(context.loginUser)
      || '';
  }

  _resolveStateTargetUserId(context = {}) {
    const loginUserId = userContextUtils.getUserIdentifier(context.loginUser);
    const currentUserId = userContextUtils.getUserIdentifier(context.currentUser);

    if (!currentUserId || currentUserId === loginUserId) {
      return null;
    }

    return currentUserId;
  }

  _buildRemoteAwarenessParams(resolvedContext) {
    const params = {
      runtimeVersion: resolvedContext.runtimeVersion,
      clientEnv: resolvedContext.clientEnv,
      sourcePage: resolvedContext.sourcePage || 'release_note_service'
    };
    const targetUserId = this._resolveStateTargetUserId(resolvedContext);

    if (targetUserId) {
      params.targetUserId = targetUserId;
    }

    return params;
  }

  _buildClientEventPayload(eventType, resolvedContext, payload) {
    const requestData = {
      eventType,
      runtimeVersion: resolvedContext.runtimeVersion,
      clientEnv: resolvedContext.clientEnv,
      sourcePage: resolvedContext.sourcePage || null,
      payload
    };
    const subjectUserId = this._resolveStateTargetUserId(resolvedContext);

    if (subjectUserId) {
      requestData.subjectUserId = subjectUserId;
    }

    return requestData;
  }

  async _getLocalCurrentNote(resolvedContext) {
    const runtimeVersion = resolvedContext.runtimeVersion;
    if (!runtimeVersion) {
      return {
        note: null,
        unread: false,
        promptEligible: false,
        effectiveUserId: this._getEffectiveUserId(resolvedContext)
      };
    }

    const note = await this.repository.findByVersion(runtimeVersion);
    if (!note || !note.matchesAudience(resolvedContext)) {
      return {
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
      note: note.toJSON(),
      unread,
      promptEligible,
      effectiveUserId
    };
  }

  async _getRemoteAwarenessState(resolvedContext) {
    if (!this.apiConfig.ENABLE_API) {
      return null;
    }

    try {
      return await this.httpClient.getUserProductState(
        this._buildRemoteAwarenessParams(resolvedContext)
      );
    } catch (error) {
      logger.warn('ReleaseNoteService', '获取后端版本感知状态失败，回退本地规则', {
        message: error.message
      });
      return {
        degraded: true,
        canAutoPrompt: false,
        canShowHelpBadge: false,
        aboutEntryMode: ABOUT_ENTRY_MODE_RECENT_CHANGES
      };
    }
  }

  _buildEntryMeta(unread, remoteState) {
    const remoteMode = String(remoteState?.aboutEntryMode || '').trim();
    const aboutEntryMode = remoteMode || (unread
      ? ABOUT_ENTRY_MODE_CURRENT_UPDATE
      : ABOUT_ENTRY_MODE_RECENT_CHANGES);
    const isCurrentUpdateMode = aboutEntryMode === ABOUT_ENTRY_MODE_CURRENT_UPDATE;

    return {
      aboutEntryMode,
      entryTitle: isCurrentUpdateMode ? '本次更新' : '近期变化',
      badgeText: unread && isCurrentUpdateMode ? '新变化' : ''
    };
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
          effectiveUserId: '',
          canShowHelpBadge: false,
          aboutEntryMode: ABOUT_ENTRY_MODE_RECENT_CHANGES,
          entryTitle: '近期变化',
          badgeText: ''
        };
      }

      const [localResult, remoteState] = await Promise.all([
        this._getLocalCurrentNote(resolvedContext),
        this._getRemoteAwarenessState(resolvedContext)
      ]);

      const entryMeta = this._buildEntryMeta(localResult.unread, remoteState);
      const promptEligible = Boolean(
        localResult.note &&
        localResult.unread &&
        localResult.promptEligible &&
        (remoteState ? remoteState.canAutoPrompt === true : true)
      );
      const canShowHelpBadge = Boolean(
        localResult.note &&
        localResult.unread &&
        (remoteState ? remoteState.canShowHelpBadge === true : true)
      );

      return {
        success: true,
        note: localResult.note,
        unread: Boolean(localResult.note && localResult.unread),
        promptEligible,
        effectiveUserId: localResult.effectiveUserId,
        canShowHelpBadge,
        aboutEntryMode: entryMeta.aboutEntryMode,
        entryTitle: entryMeta.entryTitle,
        badgeText: entryMeta.badgeText,
        awarenessState: remoteState
      };
    } catch (error) {
      logger.error('ReleaseNoteService', '获取当前版本说明失败', error);
      return {
        success: false,
        note: null,
        unread: false,
        promptEligible: false,
        effectiveUserId: '',
        canShowHelpBadge: false,
        aboutEntryMode: ABOUT_ENTRY_MODE_RECENT_CHANGES,
        entryTitle: '近期变化',
        badgeText: ''
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

  async recordClientEvent(eventType, context = {}, payload = null) {
    if (!this.apiConfig.ENABLE_API) {
      return { success: false, skipped: true };
    }

    try {
      const resolvedContext = this._buildContext(context);
      await this.httpClient.createUserActivityEvent(
        this._buildClientEventPayload(eventType, resolvedContext, payload)
      );
      return { success: true };
    } catch (error) {
      logger.warn('ReleaseNoteService', '记录客户端版本事件失败', {
        eventType,
        message: error.message
      });
      return { success: false };
    }
  }

  async markReleaseNoteRead(version, effectiveUserId, context = {}) {
    try {
      const now = Date.now();
      const result = await this.repository.saveReadState(version, effectiveUserId, {
        promptShownAt: now,
        readAt: now
      });

      if (version) {
        await this.recordClientEvent('release_note_viewed', context, {
          version
        });
      }

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
    if (!result.success || !result.note || !result.canShowHelpBadge) {
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
module.exports.ABOUT_ENTRY_MODE_CURRENT_UPDATE = ABOUT_ENTRY_MODE_CURRENT_UPDATE;
module.exports.ABOUT_ENTRY_MODE_RECENT_CHANGES = ABOUT_ENTRY_MODE_RECENT_CHANGES;
