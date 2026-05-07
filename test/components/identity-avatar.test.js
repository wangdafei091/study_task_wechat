const fs = require('fs');
const path = require('path');

describe('components/identity-avatar contract', () => {
  it('应统一承载 image/preset/fallback 三种头像渲染分支', () => {
    const wxml = fs.readFileSync(
      path.join(__dirname, '../../components/identity-avatar/identity-avatar.wxml'),
      'utf8'
    );
    const wxss = fs.readFileSync(
      path.join(__dirname, '../../components/identity-avatar/identity-avatar.wxss'),
      'utf8'
    );

    expect(wxml).toContain("avatarMode === 'image'");
    expect(wxml).toContain("avatarMode === 'preset'");
    expect(wxml).toContain('size-{{size}}');
    expect(wxml).toContain('style="{{resolvedStyle}}"');
    expect(wxml).toContain('identity-avatar-text');
    expect(wxss).toContain('.identity-avatar');
    expect(wxss).toContain('.identity-avatar.size-compact');
    expect(wxss).toContain('.identity-avatar.size-card');
    expect(wxss).toContain('.identity-avatar.preset');
    expect(wxss).toContain('.identity-avatar.image');
  });
});
