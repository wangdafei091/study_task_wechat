/**
 * user.test.js - User 领域模型测试
 *
 * 测试 User 领域模型的数据结构和业务方法
 */

const { User, UserRole, UserStatus } = require('../../models/user');

describe('User 领域模型', () => {

  describe('构造函数', () => {
    it('应该使用默认值创建用户', () => {
      const user = new User({});
      expect(user.userId).toBe('');
      expect(user.name).toBe('');
      expect(user.displayName).toBe('');
      expect(user.role).toBe(UserRole.PARENT);
      expect(user.avatar).toBe('');
      expect(user.status).toBe(UserStatus.ACTIVE);
      expect(user.createTime).toBeGreaterThan(0);
      expect(user.modifyTime).toBeGreaterThan(0);
    });

    it('应该使用提供的数据创建用户', () => {
      const userData = {
        userId: 'user_123',
        name: '张三',
        displayName: '三儿',
        role: UserRole.CHILD,
        avatar: 'avatar_456',
        status: UserStatus.INACTIVE,
        createTime: 1700000000000,
        modifyTime: 1700000001000
      };
      const user = new User(userData);
      expect(user.userId).toBe('user_123');
      expect(user.name).toBe('张三');
      expect(user.displayName).toBe('三儿');
      expect(user.role).toBe(UserRole.CHILD);
      expect(user.avatar).toBe('avatar_456');
      expect(user.status).toBe(UserStatus.INACTIVE);
      expect(user.createTime).toBe(1700000000000);
      expect(user.modifyTime).toBe(1700000001000);
    });

    it('应该生成默认时间戳', () => {
      const beforeTime = Date.now();
      const user = new User({});
      expect(user.createTime).toBeGreaterThanOrEqual(beforeTime);
      expect(user.modifyTime).toBeGreaterThanOrEqual(beforeTime);
      expect(user.createTime).toBeLessThanOrEqual(Date.now());
      expect(user.modifyTime).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('id getter 和 setter', () => {
    it('id getter应该返回userId', () => {
      const user = new User({ userId: 'user_123' });
      expect(user.id).toBe('user_123');
    });

    it('id setter应该设置userId', () => {
      const user = new User({ userId: 'user_123' });
      user.id = 'user_456';
      expect(user.userId).toBe('user_456');
    });
  });

  describe('validate', () => {
    it('有效的用户应该通过验证', () => {
      const user = new User({
        userId: 'user_123',
        name: '张三',
        role: UserRole.PARENT,
        status: UserStatus.ACTIVE
      });
      const errors = user.validate();
      expect(errors).toHaveLength(0);
    });

    it('空的userId应该返回验证错误', () => {
      const user = new User({ userId: '', name: '张三' });
      const errors = user.validate();
      expect(errors).toContain('用户ID不能为空');
    });

    it('null的userId应该返回验证错误', () => {
      const user = new User({ userId: null, name: '张三' });
      const errors = user.validate();
      expect(errors).toContain('用户ID不能为空');
    });

    it('空的name应该返回验证错误', () => {
      const user = new User({ userId: 'user_123', name: '' });
      const errors = user.validate();
      expect(errors).toContain('用户名不能为空');
    });

    it('无效的角色应该返回验证错误', () => {
      const user = new User({
        userId: 'user_123',
        name: '张三',
        role: 'invalid_role'
      });
      const errors = user.validate();
      expect(errors).toContain('用户角色无效');
    });

    it('无效的状态应该返回验证错误', () => {
      const user = new User({
        userId: 'user_123',
        name: '张三',
        status: 'invalid_status'
      });
      const errors = user.validate();
      expect(errors).toContain('用户状态无效');
    });

    it('多个错误应该都被返回', () => {
      const user = new User({
        userId: '',
        name: '',
        role: 'invalid',
        status: 'invalid'
      });
      const errors = user.validate();
      expect(errors).toContain('用户ID不能为空');
      expect(errors).toContain('用户名不能为空');
      expect(errors).toContain('用户角色无效');
      expect(errors).toContain('用户状态无效');
      expect(errors.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('isParent', () => {
    it('家长角色应该返回true', () => {
      const user = new User({ role: UserRole.PARENT });
      expect(user.isParent()).toBe(true);
    });

    it('孩子角色应该返回false', () => {
      const user = new User({ role: UserRole.CHILD });
      expect(user.isParent()).toBe(false);
    });
  });

  describe('isChild', () => {
    it('孩子角色应该返回true', () => {
      const user = new User({ role: UserRole.CHILD });
      expect(user.isChild()).toBe(true);
    });

    it('家长角色应该返回false', () => {
      const user = new User({ role: UserRole.PARENT });
      expect(user.isChild()).toBe(false);
    });
  });

  describe('isActive', () => {
    it('活跃状态应该返回true', () => {
      const user = new User({ status: UserStatus.ACTIVE });
      expect(user.isActive()).toBe(true);
    });

    it('非活跃状态应该返回false', () => {
      const user = new User({ status: UserStatus.INACTIVE });
      expect(user.isActive()).toBe(false);
    });
  });

  describe('getAccessiblePages', () => {
    it('家长应该可以访问所有页面', () => {
      const user = new User({
        userId: 'parent',
        role: UserRole.PARENT
      });
      const pages = user.getAccessiblePages();
      expect(pages).toContain('pages/index/index');
      expect(pages).toContain('pages/rewards/rewards');
      expect(pages).toContain('packageChart/pages/analysis/analysis');
      expect(pages).toContain('packageTask/pages/task-edit/task-edit');
      expect(pages).toContain('packageTask/pages/task-occurrence-edit/task-occurrence-edit');
      expect(pages).toContain('packageChart/pages/task-record/task-record');
      expect(pages).toContain('pages/reward-manage/reward-manage');
      expect(pages).toContain('packageManage/pages/about/about');
      expect(pages).not.toContain('packageManage/pages/system-admin/system-admin');
      expect(pages.length).toBeGreaterThan(0);
    });

    it('孩子只能访问基础页面', () => {
      const user = new User({
        userId: 'child',
        role: UserRole.CHILD
      });
      const pages = user.getAccessiblePages();
      expect(pages).toContain('pages/index/index');
      expect(pages).toContain('pages/rewards/rewards');
      expect(pages).toContain('pages/star-records/star-records');
      expect(pages).toContain('pages/my-exchanges/my-exchanges');
      expect(pages).toContain('pages/message/message');
      expect(pages).toContain('packageChart/pages/analysis/analysis');
      expect(pages).toContain('packageChart/pages/task-record/task-record');
      expect(pages).toContain('packageManage/pages/about/about');
      expect(pages).not.toContain('packageTask/pages/task-edit/task-edit');
      expect(pages).not.toContain('pages/reward-manage/reward-manage');
    });

    it('家长和孩子都能访问的页面应该在共同列表中', () => {
      const parentUser = new User({ role: UserRole.PARENT });
      const childUser = new User({ role: UserRole.CHILD });

      const parentPages = parentUser.getAccessiblePages();
      const childPages = childUser.getAccessiblePages();

      const commonPages = ['pages/index/index', 'pages/rewards/rewards', 'packageChart/pages/analysis/analysis'];
      commonPages.forEach(page => {
        expect(parentPages).toContain(page);
        expect(childPages).toContain(page);
      });
    });
  });

  describe('hasPageAccess', () => {
    it('家长应该有权访问任务编辑页', () => {
      const user = new User({ role: UserRole.PARENT });
      expect(user.hasPageAccess('packageTask/pages/task-edit/task-edit')).toBe(true);
    });

    it('孩子应该无权访问任务编辑页', () => {
      const user = new User({ role: UserRole.CHILD });
      expect(user.hasPageAccess('packageTask/pages/task-edit/task-edit')).toBe(false);
    });

    it('家长和孩子都应该有权访问首页', () => {
      const parentUser = new User({ role: UserRole.PARENT });
      const childUser = new User({ role: UserRole.CHILD });

      expect(parentUser.hasPageAccess('pages/index/index')).toBe(true);
      expect(childUser.hasPageAccess('pages/index/index')).toBe(true);
    });

    it('应该返回false给不存在的页面', () => {
      const user = new User({ role: UserRole.PARENT });
      expect(user.hasPageAccess('pages/nonexistent/page')).toBe(false);
    });
  });

  describe('update', () => {
    it('应该更新name', () => {
      const user = new User({ name: '旧名称' });
      user.update({ name: '新名称' });
      expect(user.name).toBe('新名称');
    });

    it('应该更新displayName', () => {
      const user = new User({ displayName: '旧昵称' });
      user.update({ displayName: '新昵称' });
      expect(user.displayName).toBe('新昵称');
    });

    it('应该更新avatar', () => {
      const user = new User({ avatar: 'old_avatar' });
      user.update({ avatar: 'new_avatar' });
      expect(user.avatar).toBe('new_avatar');
    });

    it('应该更新status', () => {
      const user = new User({ status: UserStatus.ACTIVE });
      user.update({ status: UserStatus.INACTIVE });
      expect(user.status).toBe(UserStatus.INACTIVE);
    });

    it('应该更新多个字段', () => {
      const user = new User({
        name: '旧名称',
        displayName: '旧昵称',
        avatar: 'old_avatar',
        status: UserStatus.ACTIVE
      });
      const beforeModifyTime = user.modifyTime;

      user.update({
        name: '新名称',
        displayName: '新昵称',
        avatar: 'new_avatar',
        status: UserStatus.INACTIVE
      });

      expect(user.name).toBe('新名称');
      expect(user.displayName).toBe('新昵称');
      expect(user.avatar).toBe('new_avatar');
      expect(user.status).toBe(UserStatus.INACTIVE);
      expect(user.modifyTime).toBeGreaterThanOrEqual(beforeModifyTime);
    });

    it('undefined字段不应该被更新', () => {
      const user = new User({
        name: '原名称',
        displayName: '原昵称'
      });
      user.update({ name: '新名称', displayName: undefined });
      expect(user.name).toBe('新名称');
      expect(user.displayName).toBe('原昵称');
    });

    it('不应该更新role', () => {
      const user = new User({ role: UserRole.PARENT });
      user.update({ role: UserRole.CHILD });
      expect(user.role).toBe(UserRole.PARENT);
    });

    it('不应该更新userId', () => {
      const user = new User({ userId: 'user_123' });
      user.update({ userId: 'user_456' });
      expect(user.userId).toBe('user_123');
    });
  });

  describe('toObject', () => {
    it('应该正确转换为简单对象', () => {
      const user = new User({
        userId: 'user_123',
        name: '张三',
        displayName: '三儿',
        role: UserRole.CHILD,
        avatar: 'avatar_456',
        status: UserStatus.ACTIVE
      });
      const obj = user.toObject();
      expect(obj.userId).toBe('user_123');
      expect(obj.name).toBe('张三');
      expect(obj.displayName).toBe('三儿');
      expect(obj.role).toBe(UserRole.CHILD);
      expect(obj.avatar).toBe('avatar_456');
      expect(obj.status).toBe(UserStatus.ACTIVE);
      expect(obj.createTime).toBeGreaterThan(0);
      expect(obj.modifyTime).toBeGreaterThan(0);
    });

    it('转换的对象应该不是原实例', () => {
      const user = new User({ userId: 'user_123' });
      const obj = user.toObject();
      expect(obj).not.toBe(user);
    });

    it('转换的对象应该有所有必要属性', () => {
      const user = new User({ userId: 'user_123' });
      const obj = user.toObject();
      expect(obj).toHaveProperty('userId');
      expect(obj).toHaveProperty('name');
      expect(obj).toHaveProperty('displayName');
      expect(obj).toHaveProperty('role');
      expect(obj).toHaveProperty('avatar');
      expect(obj).toHaveProperty('status');
      expect(obj).toHaveProperty('createTime');
      expect(obj).toHaveProperty('modifyTime');
    });
  });

  describe('clone', () => {
    it('应该克隆用户对象', () => {
      const originalUser = new User({
        userId: 'user_123',
        name: '张三',
        role: UserRole.PARENT
      });
      const clonedUser = originalUser.clone();
      expect(clonedUser).not.toBe(originalUser);
      expect(clonedUser.userId).toBe(originalUser.userId);
      expect(clonedUser.name).toBe(originalUser.name);
      expect(clonedUser.role).toBe(originalUser.role);
    });

    it('克隆用户应该覆盖属性', () => {
      const originalUser = new User({
        userId: 'user_123',
        name: '张三',
        displayName: '三儿'
      });
      const clonedUser = originalUser.clone({
        name: '李四',
        displayName: '四儿'
      });
      expect(clonedUser.userId).toBe('user_123');
      expect(clonedUser.name).toBe('李四');
      expect(clonedUser.displayName).toBe('四儿');
    });

    it('克隆的用户是独立的实例', () => {
      const originalUser = new User({ name: '张三' });
      const clonedUser = originalUser.clone();

      originalUser.update({ name: '李四' });
      expect(originalUser.name).toBe('李四');
      expect(clonedUser.name).toBe('张三');
    });
  });

  describe('边界条件', () => {
    it('应该处理空字符串的avatar', () => {
      const user = new User({ avatar: '' });
      expect(user.avatar).toBe('');
    });

    it('应该处理null的displayName', () => {
      const user = new User({ displayName: null });
      expect(user.displayName).toBe('');
    });

    it('应该处理undefined的name', () => {
      const user = new User({ name: undefined });
      expect(user.name).toBe('');
    });

    it('应该处理非常大的userId', () => {
      const longUserId = 'user_' + 'a'.repeat(1000);
      const user = new User({ userId: longUserId });
      expect(user.userId).toBe(longUserId);
    });

    it('应该处理非常长的name', () => {
      const longName = '张' + '三'.repeat(100);
      const user = new User({ userId: 'user_123', name: longName });
      expect(user.name).toBe(longName);
    });

    it('应该处理createTime和modifyTime为当前时间（0会被替换为当前时间）', () => {
      const user = new User({
        createTime: 0,
        modifyTime: 0
      });
      // 0是假值，所以会被Date.now()替换
      expect(user.createTime).toBeGreaterThan(0);
      expect(user.modifyTime).toBeGreaterThan(0);
    });

    it('update不提供参数时不应该报错', () => {
      const user = new User({ name: '张三' });
      expect(() => user.update({})).not.toThrow();
      expect(user.name).toBe('张三');
    });
  });

  describe('枚举值', () => {
    it('UserRole应该包含正确的值', () => {
      expect(UserRole.PARENT).toBe('parent');
      expect(UserRole.CHILD).toBe('child');
      expect(Object.values(UserRole)).toContain('parent');
      expect(Object.values(UserRole)).toContain('child');
    });

    it('UserStatus应该包含正确的值', () => {
      expect(UserStatus.ACTIVE).toBe('active');
      expect(UserStatus.INACTIVE).toBe('inactive');
      expect(Object.values(UserStatus)).toContain('active');
      expect(Object.values(UserStatus)).toContain('inactive');
    });
  });
});
