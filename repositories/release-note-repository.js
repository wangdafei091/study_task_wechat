const StorageAdapter = require('../adapters/storage-adapter');
const ReleaseNote = require('../models/release-note');
const logger = require('../utils/logger');
const defaultRegistry = require('../utils/release-notes/index.js');

const DEFAULT_STORAGE_KEY = 'releaseNoteReadStates';

function sortNotesByPublishedAtDesc(notes = []) {
  return [...notes].sort((left, right) => {
    const leftTime = Date.parse(left.publishedAt || '') || 0;
    const rightTime = Date.parse(right.publishedAt || '') || 0;

    if (rightTime !== leftTime) {
      return rightTime - leftTime;
    }

    return String(right.version || '').localeCompare(String(left.version || ''));
  });
}

class ReleaseNoteRepository {
  constructor(storageAdapter, options = {}) {
    this.storageAdapter = storageAdapter || new StorageAdapter({
      namespace: options.namespace || ''
    });
    this.storageKey = options.storageKey || DEFAULT_STORAGE_KEY;
    this.registry = Array.isArray(options.registry) ? options.registry : defaultRegistry;

    logger.info('ReleaseNoteRepository', '初始化版本说明仓储', {
      registrySize: this.registry.length
    });
  }

  _buildReadStateKey(version, effectiveUserId) {
    return `${effectiveUserId || 'anonymous'}::${version || ''}`;
  }

  _createReadState(version, effectiveUserId, input = {}) {
    return {
      version: String(version || '').trim(),
      effectiveUserId: String(effectiveUserId || '').trim(),
      promptShownAt: Number(input.promptShownAt || 0) || 0,
      readAt: Number(input.readAt || 0) || 0
    };
  }

  _buildModel(data = {}) {
    const note = data instanceof ReleaseNote ? data : new ReleaseNote(data);
    return note;
  }

  async getAllNotes() {
    const notes = sortNotesByPublishedAtDesc(this.registry).map((item) => this._buildModel(item));
    return notes;
  }

  async findByVersion(version) {
    const targetVersion = String(version || '').trim();
    if (!targetVersion) {
      return null;
    }

    const notes = await this.getAllNotes();
    return notes.find((item) => item.version === targetVersion) || null;
  }

  async getReadState(version, effectiveUserId) {
    const targetVersion = String(version || '').trim();
    const targetUserId = String(effectiveUserId || '').trim();
    if (!targetVersion || !targetUserId) {
      return this._createReadState(targetVersion, targetUserId);
    }

    const stateMap = await this.storageAdapter.getAsync(this.storageKey, {});
    const stateKey = this._buildReadStateKey(targetVersion, targetUserId);
    return this._createReadState(targetVersion, targetUserId, stateMap[stateKey]);
  }

  async saveReadState(version, effectiveUserId, patch = {}) {
    const targetVersion = String(version || '').trim();
    const targetUserId = String(effectiveUserId || '').trim();
    if (!targetVersion || !targetUserId) {
      return {
        success: false,
        message: '版本或用户标识不能为空'
      };
    }

    const stateMap = await this.storageAdapter.getAsync(this.storageKey, {});
    const stateKey = this._buildReadStateKey(targetVersion, targetUserId);
    const currentState = this._createReadState(targetVersion, targetUserId, stateMap[stateKey]);
    const nextState = this._createReadState(targetVersion, targetUserId, {
      ...currentState,
      ...patch
    });

    const saved = await this.storageAdapter.setAsync(this.storageKey, {
      ...stateMap,
      [stateKey]: nextState
    });

    return {
      success: saved === true,
      state: nextState
    };
  }
}

module.exports = ReleaseNoteRepository;
