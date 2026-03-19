/**
 * M07 Task 模型字段单元测试（非数据库集成测试）
 *
 * 本文件使用 mock，不依赖数据库，覆盖范围：
 *   - Task.fromDB 对新字段（completionTime/starAwarded/modifyTime 等）的映射
 *   - Task.toJSON 不暴露 deletedAt
 *
 * ⚠️ 真实后端集成测试（PUT/DELETE/PATCH 路由、scope=family 权限、
 *    deleted_at IS NULL 过滤、迁移后 SQL 行为）需要 MySQL 环境，
 *    目前为已知限制，待搭建 CI 数据库环境后补充。
 *    手动验证步骤：执行 005_alter_tasks_add_fields.sql 后运行：
 *      SELECT * FROM tasks WHERE deleted_at IS NOT NULL
 *    应仅返回已软删除记录。
 */

// 模拟数据库 query/execute
const mockStore = [];
let seqId = 0;

jest.mock('../../config/database', () => ({
  query: jest.fn(),
  execute: jest.fn()
}), { virtual: true });

// 直接测试 Task 模型字段处理
const Task = require('../../models/Task');

describe('M07 后端 Task 模型字段测试', () => {
  it('fromDB 应正确映射新字段', () => {
    const dbRecord = {
      task_id: 'task_001',
      user_id: 'user_001',
      title: '测试任务',
      description: '',
      type: 'study',
      date: '2026-03-01',
      startTime: '',
      endTime: '',
      points: 5,
      pointsExpiry: 'permanent',
      isRequired: false,
      status: 1,
      repeat: null,
      isAllDay: false,
      penaltyApplied: false,
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-01T00:00:00Z',
      deleted_at: null,
      completion_time: 1709251200000,
      star_awarded: 1,
      modify_time: 1709251200001,
      duration: 30,
      has_no_end_date: 0,
      tags: JSON.stringify(['数学', '语文']),
    };

    const task = Task.fromDB(dbRecord);

    expect(task.taskId).toBe('task_001');
    expect(task.completionTime).toBe(1709251200000);
    expect(task.starAwarded).toBe(true);
    expect(task.modifyTime).toBe(1709251200001);
    expect(task.duration).toBe(30);
    expect(task.hasNoEndDate).toBe(false);
    expect(task.tags).toEqual(['数学', '语文']);
    expect(task.deletedAt).toBeNull();
  });

  it('fromDB：star_awarded=0 时 starAwarded 应为 false', () => {
    const dbRecord = {
      task_id: 'task_002',
      user_id: 'user_001',
      title: '任务2',
      type: 'study',
      date: '2026-03-01',
      status: 0,
      star_awarded: 0,
      deleted_at: null,
    };

    const task = Task.fromDB(dbRecord);
    expect(task.starAwarded).toBe(false);
  });

  it('fromDB：has_no_end_date=1 时 hasNoEndDate 应为 true', () => {
    const dbRecord = {
      task_id: 'task_003',
      user_id: 'user_001',
      title: '任务3',
      type: 'study',
      date: '2026-03-01',
      status: 0,
      has_no_end_date: 1,
      deleted_at: null,
    };

    const task = Task.fromDB(dbRecord);
    expect(task.hasNoEndDate).toBe(true);
  });

  it('toJSON 应包含新字段，不暴露 deletedAt', () => {
    const task = new Task({
      taskId: 'task_004',
      userId: 'user_001',
      title: '任务4',
      type: 'study',
      date: '2026-03-01',
      completionTime: 1709251200000,
      starAwarded: true,
      modifyTime: 1709251200001,
      duration: 45,
      hasNoEndDate: false,
      tags: ['英语'],
      deletedAt: '2026-03-10T00:00:00Z',
    });

    const json = task.toJSON();

    expect(json.completionTime).toBe(1709251200000);
    expect(json.starAwarded).toBe(true);
    expect(json.modifyTime).toBe(1709251200001);
    expect(json.duration).toBe(45);
    expect(json.hasNoEndDate).toBe(false);
    expect(json.tags).toEqual(['英语']);
    // deletedAt 不对外暴露
    expect(json.deletedAt).toBeUndefined();
  });

  it('fromDB：tags 字段为 null 时应返回 null', () => {
    const dbRecord = {
      task_id: 'task_005',
      user_id: 'user_001',
      title: '任务5',
      type: 'study',
      date: '2026-03-01',
      status: 0,
      tags: null,
      deleted_at: null,
    };

    const task = Task.fromDB(dbRecord);
    expect(task.tags).toBeNull();
  });
});
