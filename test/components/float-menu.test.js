const fs = require('fs');
const path = require('path');

describe('components/float-menu', () => {
  it('右侧锚点的第四项菜单不应继续向屏幕外侧展开', () => {
    const wxss = fs.readFileSync(
      path.join(__dirname, '../../components/float-menu/float-menu.wxss'),
      'utf8'
    );

    expect(wxss).toContain('.float-menu.position-bottom-right.active .float-menu-item:nth-child(4) {\n  transform: scale(1) translate(-10rpx, -220rpx);');
    expect(wxss).toContain('.float-menu.position-top-right.active .float-menu-item:nth-child(4) {\n  transform: scale(1) translate(-10rpx, 220rpx);');
    expect(wxss).not.toContain('.float-menu.position-bottom-right.active .float-menu-item:nth-child(4) {\n  transform: scale(1) translate(110rpx, -110rpx);');
    expect(wxss).not.toContain('.float-menu.position-top-right.active .float-menu-item:nth-child(4) {\n  transform: scale(1) translate(110rpx, 110rpx);');
  });
});
