# 修复测试环境问题

> **创建日期**：2026-03-05
> **状态**：待审核
> **优先级**：高
> **预计工期**：1-2天

---

## 需求分析

### 问题描述

当前测试环境存在以下问题：

1. **wx API mock问题**
   - 错误信息：`wx[method] is not a function`
   - 影响范围：所有涉及StorageAdapter的测试
   - 根本原因：jest-setup.js中的wx对象mock不完整

2. **StorageAdapter测试兼容性问题**
   - BaseRepository测试中storage-adapter调用失败
   - 测试环境与生产环境的API不一致

3. **失败测试用例**
   - 部分测试用例因上述问题而失败
   - 需要清理和修复

### 影响评估

- **严重程度**：中（影响测试运行，但不影响生产代码）
- **影响范围**：所有Repository层测试
- **风险等级**：低（仅修改测试配置）

---

## 技术方案

### 方案概述

1. 完善jest-setup.js中的wx API mock
2. 优化StorageAdapter的测试兼容性
3. 清理和修复失败测试用例

### 详细设计

#### 1. 完善wx API mock

**目标**：确保测试环境中wx对象完整且可用

**实施步骤**：

1. 在`jest-setup.js`中补充完整的wx.storage API
```javascript
wx.getStorage = jest.fn((options) => {
  if (options.success) {
    options.success(mockData[options.key]);
  }
  if (options.complete) {
    options.complete();
  }
});

wx.setStorage = jest.fn((options) => {
  mockData[options.key] = options.data;
  if (options.success) {
    options.success();
  }
  if (options.complete) {
    options.complete();
  }
});
```

2. 补充其他必要的wx API mock
   - wx.getSystemInfo
   - wx.getDeviceInfo
   - wx.getWindowInfo

#### 2. 优化StorageAdapter测试兼容性

**目标**：使StorageAdapter在测试环境正常工作

**实施步骤**：

1. 在StorageAdapter中添加测试环境检测
2. 提供测试环境专用的存储实现
3. 确保测试环境不调用真实的wx API

#### 3. 清理失败测试用例

**目标**：移除或修复因环境问题导致的失败测试

**实施步骤**：

1. 识别所有失败测试用例
2. 分析失败原因
3. 决定是修复还是删除
4. 更新测试文件

### 文件清单

- `jest-setup.js` - 完善wx API mock
- `adapters/storage-adapter.js` - 优化测试兼容性
- `test/repositories/base-repository.test.js` - 清理失败测试
- `test/repositories/*.test.js` - 其他repository测试文件

---

## 实施步骤

### 阶段1：完善wx API mock（0.5天）

1. [ ] 分析jest-setup.js当前mock情况
2. [ ] 补充wx.storage相关API
3. [ ] 补充其他必要的wx API
4. [ ] 验证mock完整性

### 阶段2：优化StorageAdapter（0.5天）

1. [ ] 添加测试环境检测逻辑
2. [ ] 实现测试环境专用存储
3. [ ] 确保API一致性

### 阶段3：清理测试用例（0.5天）

1. [ ] 运行测试识别失败用例
2. [ ] 分析每个失败用例
3. [ ] 修复或删除失败用例
4. [ ] 验证所有测试通过

---

## 测试方案

### 测试目标

- 所有Repository层测试正常运行
- 测试覆盖率检查通过
- 测试输出清晰可读

### 验收标准

- [ ] `npm test`命令无失败
- [ ] `npm run test:coverage`正常生成报告
- [ ] 无wx相关的错误信息
- [ ] 测试通过率 > 98%

---

## 风险评估

### 风险项

1. **mock不完整风险**
   - 概率：中
   - 影响：部分测试仍可能失败
   - 应对：逐步补充，持续测试

2. **测试环境与生产环境不一致风险**
   - 概率：低
   - 影响：测试通过但生产环境有问题
   - 应对：保持API一致性

### 应对措施

- 逐步实施，每步验证
- 保持测试环境与生产环境API一致
- 完善测试覆盖

---

## 预期成果

### 直接成果

- 测试环境稳定运行
- 无wx相关错误
- 测试通过率 > 98%
- 测试覆盖率检查正常

### 间接成果

- 提升开发效率
- 增强代码质量保障
- 改善测试体验

---

## 附录

### 参考文档

- [Jest配置](../.jestrc.js)
- [测试规范](../docs/development/coding_standards.md#测试规范)
- [StorageAdapter实现](../adapters/storage-adapter.js)

### 相关问题

- Issue: 测试环境wx API不完整
- Issue: StorageAdapter测试兼容性问题

---

**创建人**：Claude Code
**审核状态**：待审核
**最后更新**：2026-03-05
