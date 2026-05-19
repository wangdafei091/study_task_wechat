const ReleaseNote = require('../../models/release-note');

describe('ReleaseNote', () => {
  it('应构造合法版本说明并匹配受众', () => {
    const note = new ReleaseNote({
      version: '3.9.0',
      publishedAt: '2026-05-19',
      title: '本次更新',
      summary: '现在可以更快看到版本变化',
      audiences: ['parent', 'manager'],
      highlights: [
        {
          id: 'highlight_1',
          kind: 'new',
          title: '首页轻提醒',
          summary: '首页会提示新变化'
        }
      ]
    });

    expect(note.validate()).toEqual([]);
    expect(note.matchesAudience({
      currentUser: { userId: 'parent-1', role: 'parent' },
      loginUser: { userId: 'parent-1', role: 'parent', familyPermissionRole: 'manager' }
    })).toBe(true);
    expect(note.matchesAudience({
      currentUser: { userId: 'child-1', role: 'child' },
      loginUser: { userId: 'parent-1', role: 'parent', familyPermissionRole: 'manager' }
    })).toBe(false);
  });

  it('应拦截超过 3 条高亮和非法跳转路径', () => {
    const note = new ReleaseNote({
      version: '3.9.0',
      publishedAt: '2026/05/19',
      title: '',
      summary: '',
      audiences: ['invalid'],
      highlights: [
        { id: '', kind: 'new', title: '', summary: '' },
        { id: 'h2', kind: 'improved', title: '2', summary: '2' },
        { id: 'h3', kind: 'fixed', title: '3', summary: '3' },
        { id: 'h4', kind: 'new', title: '4', summary: '4', actionPath: 'pages/index/index' }
      ]
    });

    expect(note.validate()).toEqual(expect.arrayContaining([
      '发布日期格式无效',
      '标题不能为空',
      '摘要不能为空',
      '受众类型无效: invalid',
      '高亮条目不能超过 3 条',
      '高亮1缺少 id',
      '高亮1标题不能为空',
      '高亮1摘要不能为空',
      '高亮4跳转路径无效'
    ]));
  });
});
