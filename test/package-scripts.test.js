const pkg = require('../package.json');

describe('package.json quality scripts', () => {
  it('test:quality 应显式使用 M13 的质量闸门配置', () => {
    expect(pkg.scripts['test:quality']).toContain('jest.quality.config.js');
  });

  it('test:coverage 应与质量闸门使用同一份配置口径', () => {
    expect(pkg.scripts['test:coverage']).toContain('jest.quality.config.js');
  });
});
