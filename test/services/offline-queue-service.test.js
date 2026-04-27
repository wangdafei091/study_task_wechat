jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const OfflineQueueService = require('../../services/offline-queue-service');

function createMemoryRepository(initialItems = [], initialMeta = {}) {
  let items = initialItems.slice();
  let meta = { ...initialMeta };

  return {
    loadFromStorage: jest.fn().mockResolvedValue(true),
    getAll: jest.fn(async () => items.map((item) => ({ ...item }))),
    replaceAll: jest.fn(async (nextItems) => {
      items = nextItems.map((item) => ({ ...item }));
      return items.map((item) => ({ ...item }));
    }),
    getMeta: jest.fn(async () => ({ ...meta })),
    setMeta: jest.fn(async (nextMeta) => {
      meta = { ...nextMeta };
      return true;
    })
  };
}

describe('OfflineQueueService', () => {
  it('create -> update 应折叠为单条 create', async () => {
    const repository = createMemoryRepository();
    const service = new OfflineQueueService({
      repository,
      contextResolver: () => ({
        familyId: 'family_1',
        loginUserId: 'parent_1',
        actorUserId: 'parent_1',
        actorRole: 'parent'
      })
    });

    await service.enqueueMutation({
      domain: 'task',
      entityId: 'task_1',
      operation: 'create',
      payload: { title: '数学' },
      snapshot: { syncedToCloud: false }
    });
    await service.enqueueMutation({
      domain: 'task',
      entityId: 'task_1',
      operation: 'update',
      payload: { title: '数学作业' }
    });

    const items = await repository.getAll();
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(expect.objectContaining({
      domain: 'task',
      entityId: 'task_1',
      operation: 'create',
      payload: expect.objectContaining({ title: '数学作业' })
    }));
  });

  it('create -> delete 且对象未上云时应折叠为 no-op', async () => {
    const repository = createMemoryRepository();
    const service = new OfflineQueueService({
      repository,
      contextResolver: () => ({
        familyId: 'family_1',
        loginUserId: 'parent_1',
        actorUserId: 'parent_1',
        actorRole: 'parent'
      })
    });

    await service.enqueueMutation({
      domain: 'reward',
      entityId: 'reward_1',
      operation: 'create',
      snapshot: { syncedToCloud: false }
    });
    const deleted = await service.enqueueMutation({
      domain: 'reward',
      entityId: 'reward_1',
      operation: 'delete',
      snapshot: { syncedToCloud: false }
    });

    expect(deleted).toBeNull();
    await expect(repository.getAll()).resolves.toEqual([]);
  });

  it('drain 应按上下文过滤并返回 partial/remaining', async () => {
    const repository = createMemoryRepository([
      {
        id: 'item_1',
        domain: 'task',
        entityId: 'task_1',
        operation: 'update',
        context: {
          familyId: 'family_1',
          loginUserId: 'parent_1',
          actorUserId: 'parent_1',
          actorRole: 'parent'
        },
        createdAt: 1
      },
      {
        id: 'item_2',
        domain: 'task',
        entityId: 'task_2',
        operation: 'update',
        context: {
          familyId: 'family_1',
          loginUserId: 'parent_1',
          actorUserId: 'parent_1',
          actorRole: 'parent'
        },
        createdAt: 2
      },
      {
        id: 'item_3',
        domain: 'task',
        entityId: 'task_3',
        operation: 'update',
        context: {
          familyId: 'family_2',
          loginUserId: 'parent_2',
          actorUserId: 'parent_2',
          actorRole: 'parent'
        },
        createdAt: 3
      }
    ]);

    const adapter = jest.fn().mockResolvedValue(true);
    const service = new OfflineQueueService({
      repository,
      contextResolver: () => ({
        familyId: 'family_1',
        loginUserId: 'parent_1',
        actorUserId: 'parent_1',
        actorRole: 'parent'
      })
    });
    service.registerAdapter('task', adapter);

    const result = await service.drain({
      domains: ['task'],
      reason: 'before_task_read',
      limit: 1
    });

    expect(adapter).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      success: true,
      processed: 1,
      skipped: 1,
      failed: 0,
      partial: true,
      remaining: 1
    });
  });

  it('系统只读时 drain 应跳过所有匹配写队列，不执行 adapter', async () => {
    const repository = createMemoryRepository([
      {
        id: 'item_1',
        domain: 'task',
        entityId: 'task_1',
        operation: 'update',
        context: {
          familyId: 'family_1',
          loginUserId: 'parent_1',
          systemAccessLevel: 'readonly',
          actorUserId: 'parent_1',
          actorRole: 'parent'
        },
        createdAt: 1
      },
      {
        id: 'item_2',
        domain: 'reward',
        entityId: 'reward_1',
        operation: 'delete',
        context: {
          familyId: 'family_1',
          loginUserId: 'parent_1',
          systemAccessLevel: 'readonly',
          actorUserId: 'parent_1',
          actorRole: 'parent'
        },
        createdAt: 2
      }
    ]);
    const adapter = jest.fn().mockResolvedValue(true);
    const service = new OfflineQueueService({
      repository,
      contextResolver: () => ({
        familyId: 'family_1',
        loginUserId: 'parent_1',
        systemAccessLevel: 'readonly',
        actorUserId: 'parent_1',
        actorRole: 'parent'
      })
    });
    service.registerAdapter('task', adapter);
    service.registerAdapter('reward', adapter);

    const result = await service.drain({
      reason: 'post_login_bootstrap',
      force: true
    });

    expect(adapter).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      processed: 0,
      skipped: 2,
      failed: 0,
      partial: false,
      remaining: 0,
      reason: 'system_readonly'
    });
  });

  it('legacy item 缺少 loginUserId 时应退化为 familyId + actorUserId 匹配', async () => {
    const repository = createMemoryRepository([
      {
        id: 'legacy_1',
        domain: 'task',
        entityId: 'task_legacy',
        operation: 'update',
        source: 'legacy_migration',
        context: {
          familyId: 'family_1',
          actorUserId: 'parent_1',
          actorRole: 'parent'
        },
        createdAt: 1
      }
    ]);
    const adapter = jest.fn().mockResolvedValue(true);
    const service = new OfflineQueueService({
      repository,
      contextResolver: () => ({
        familyId: 'family_1',
        loginUserId: 'parent_1',
        actorUserId: 'parent_1',
        actorRole: 'parent'
      })
    });
    service.registerAdapter('task', adapter);

    const result = await service.drain({ domains: ['task'], reason: 'manual', limit: 10 });

    expect(adapter).toHaveBeenCalledTimes(1);
    expect(result.processed).toBe(1);
  });

  it('migrateLegacyPendingState 应按 legacyMigrationKey 幂等导入', async () => {
    const repository = createMemoryRepository([
      {
        id: 'existing',
        domain: 'task',
        entityId: 'task_1',
        operation: 'update',
        legacyMigrationKey: 'task:pending:task_1:update'
      }
    ]);
    const migrator = jest.fn(async () => [
      {
        domain: 'task',
        entityId: 'task_1',
        operation: 'update',
        legacyMigrationKey: 'task:pending:task_1:update'
      },
      {
        domain: 'reward',
        entityId: 'reward_1',
        operation: 'delete',
        legacyMigrationKey: 'reward:tombstone:reward_1:delete'
      }
    ]);
    const service = new OfflineQueueService({
      repository,
      migrators: [migrator]
    });

    const result = await service.migrateLegacyPendingState();
    const items = await repository.getAll();

    expect(result).toEqual({
      success: true,
      migratedCount: 1,
      skippedCount: 1
    });
    expect(items).toHaveLength(2);
    expect(items[1]).toEqual(expect.objectContaining({
      domain: 'reward',
      source: 'legacy_migration',
      suppressFailureEvents: true,
      legacyMigrationKey: 'reward:tombstone:reward_1:delete'
    }));
  });
});
