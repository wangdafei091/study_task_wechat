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
  });

  describe('resolveAnalysisOptions', () => {
    it('家长切到孩子视角时分析页应该返回孩子 userId', () => {
      const result = viewScopeUtils.resolveAnalysisOptions(
        { role: 'parent', familyId: 'family_1', id: 'parent_1' },
        { role: 'child', id: 'child_1', familyId: 'family_1' }
      );

      expect(result).toEqual({ userId: 'child_1' });
    });

    it('家长处于家长视角时分析页应该返回家庭 scope', () => {
      const result = viewScopeUtils.resolveAnalysisOptions(
        { role: 'parent', familyId: 'family_1', id: 'parent_1' },
        { role: 'parent', id: 'parent_1', familyId: 'family_1' }
      );

      expect(result).toEqual({ scope: 'family' });
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
