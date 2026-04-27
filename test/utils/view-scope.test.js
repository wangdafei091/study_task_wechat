const viewScopeUtils = require('../../utils/view-scope');

describe('view-scope utils', () => {
  describe('resolveMessageScopeOptions', () => {
    it('家长切到孩子视角时应该返回孩子个人消息流', () => {
      const result = viewScopeUtils.resolveMessageScopeOptions(
        { role: 'parent', familyId: 'family_1', id: 'parent_1' },
        { role: 'child', id: 'child_1', familyId: 'family_1' }
      );

      expect(result).toEqual({
        scope: 'user',
        userId: 'child_1'
      });
    });

    it('家长处于家长视角时应该返回家庭消息流', () => {
      const result = viewScopeUtils.resolveMessageScopeOptions(
        { role: 'parent', familyId: 'family_1', id: 'parent_1' },
        { role: 'parent', id: 'parent_1', familyId: 'family_1' }
      );

      expect(result).toEqual({
        scope: 'family',
        userId: null
      });
    });

    it('家长未加入家庭时应该回退到家长个人消息流', () => {
      const result = viewScopeUtils.resolveMessageScopeOptions(
        { role: 'parent', id: 'parent_1' },
        { role: 'parent', id: 'parent_1' }
      );

      expect(result).toEqual({
        scope: 'user',
        userId: 'parent_1'
      });
    });
  });

  describe('resolveAnalysisOptions', () => {
    it('家长切到孩子视角时分析页应该返回孩子 userId', () => {
      const result = viewScopeUtils.resolveAnalysisOptions(
        { role: 'parent', familyId: 'family_1', id: 'parent_1' },
        { role: 'child', id: 'child_1', familyId: 'family_1' },
        []
      );

      expect(result).toEqual({ userId: 'child_1' });
    });

    it('无家庭时家长视角应该返回家长自己', () => {
      const result = viewScopeUtils.resolveAnalysisOptions(
        { role: 'parent', id: 'parent_1' },
        { role: 'parent', id: 'parent_1' },
        []
      );

      expect(result).toEqual({ userId: 'parent_1' });
    });

    it('有家庭但没有孩子时家长视角应该返回空 childUserIds 的 family scope', () => {
      const result = viewScopeUtils.resolveAnalysisOptions(
        { role: 'parent', familyId: 'family_1', id: 'parent_1' },
        { role: 'parent', id: 'parent_1', familyId: 'family_1' },
        [{ role: 'parent', id: 'parent_1', familyId: 'family_1', status: 'active' }]
      );

      expect(result).toEqual({
        scope: 'family',
        childUserIds: []
      });
    });

    it('单孩子家庭下家长视角应该返回 family scope 与单个 childUserId', () => {
      const result = viewScopeUtils.resolveAnalysisOptions(
        { role: 'parent', familyId: 'family_1', id: 'parent_1' },
        { role: 'parent', id: 'parent_1', familyId: 'family_1' },
        [
          { role: 'parent', id: 'parent_1', familyId: 'family_1', status: 'active' },
          { role: 'child', id: 'child_1', familyId: 'family_1', status: 'active' }
        ]
      );

      expect(result).toEqual({
        scope: 'family',
        childUserIds: ['child_1']
      });
    });

    it('多孩子家庭下家长视角应该返回 family scope 与 childUserIds', () => {
      const result = viewScopeUtils.resolveAnalysisOptions(
        { role: 'parent', familyId: 'family_1', id: 'parent_1' },
        { role: 'parent', id: 'parent_1', familyId: 'family_1' },
        [
          { role: 'parent', id: 'parent_1', familyId: 'family_1', status: 'active' },
          { role: 'child', id: 'child_1', familyId: 'family_1', status: 'active' },
          { role: 'child', id: 'child_2', familyId: 'family_1', status: 'active' },
          { role: 'child', id: 'child_3', familyId: 'family_1', status: 'inactive' }
        ]
      );

      expect(result).toEqual({
        scope: 'family',
        childUserIds: ['child_1', 'child_2']
      });
    });
  });

  describe('hasResolvedAnalysisOptions', () => {
    it('应该识别 family scope 已就绪', () => {
      expect(viewScopeUtils.hasResolvedAnalysisOptions({ scope: 'family' })).toBe(true);
    });

    it('应该识别 userId 已就绪', () => {
      expect(viewScopeUtils.hasResolvedAnalysisOptions({ userId: 'child_1' })).toBe(true);
    });

    it('应该识别空分析范围未就绪', () => {
      expect(viewScopeUtils.hasResolvedAnalysisOptions(null)).toBe(false);
      expect(viewScopeUtils.hasResolvedAnalysisOptions({})).toBe(false);
    });
  });
});
