# API文档更新工作流

本文档详细描述了在代码变更时，如何同步更新API文档的工作流程，确保文档与代码保持一致。

## 文档更新原则

1. **同步更新**：代码变更必须伴随文档更新，不允许滞后
2. **完整性**：文档应包含函数签名、参数说明、返回值和使用示例
3. **准确性**：示例代码必须能够直接运行，不能有语法或逻辑错误
4. **追踪性**：记录重要API的变更历史，便于了解演进过程

## 更新工作流

### 1. 新增API时

**步骤1**: 在实现代码的同时编写API文档
```javascript
/**
 * 函数名称
 * @param {Type} paramName - 参数说明
 * @returns {Type} 返回值说明
 * @description 函数详细说明
 * @example
 * // 使用示例
 * const result = functionName(param);
 */
```

**步骤2**: 在对应的API文档中添加新条目
- 工具函数：在 `docs/api/utils_guide.md` 中添加
- 组件：在 `docs/api/components-guide.md` 中添加
- 服务：在 `docs/api/services-guide.md` 中添加

**步骤3**: 提交代码时在commit消息中注明文档更新
```
feat: 添加XX功能并更新对应文档
```

### 2. 修改API时

**步骤1**: 确定变更影响范围
- 收集所有使用该API的地方
- 评估是否是破坏性变更，是否需要迁移策略

**步骤2**: 更新API文档
- 修改函数签名、参数和返回值说明
- 更新使用示例
- 添加变更说明和迁移指南（如果有破坏性变更）

**步骤3**: 更新代码中的JSDoc注释
- 确保代码中的注释与文档一致

**步骤4**: 在文档末尾的更新历史中记录重要变更
```
## 更新历史

| 日期 | 版本 | 说明 |
| --- | --- | --- |
| 2023-06-01 | v1.0 | 初始版本 |
| 2023-07-15 | v1.1 | 新增参数X用于支持功能Y |
```

### 3. 废弃API时

**步骤1**: 在代码中添加废弃标记
```javascript
/**
 * @deprecated 从v2.0起废弃，请使用newFunction()代替
 */
```

**步骤2**: 在API文档中添加废弃警告
- 明确标记为已废弃
- 提供替代方案和迁移路径
- 如果可能，保留一段时间的向后兼容性

**步骤3**: 添加到废弃API列表
- 在文档的"废弃API"部分添加条目
- 标明废弃时间和替代方案

## 文档审查流程

### 1. 自检清单

每次更新文档前，请检查以下项目：
- [ ] 函数签名是否正确
- [ ] 所有参数是否有说明
- [ ] 返回值是否有说明
- [ ] 是否提供了有效的使用示例
- [ ] 示例代码是否通过测试
- [ ] 是否记录了重要变更

### 2. 同行评审

- 代码审查时必须包含文档审查
- 重点关注文档与代码实现的一致性
- 检查示例是否符合最佳实践

### 3. 定期文档测试

- 每季度对文档中的示例代码进行测试
- 使用自动化工具提取并执行示例代码
- 更新过时的示例

## 常见问题与解决方案

### 1. 文档与代码不一致怎么办？

- 立即更新文档以匹配当前代码
- 在下次迭代中添加测试确保文档示例可运行
- 考虑添加自动化文档生成工具

### 2. API变更太频繁，文档难以维护怎么办？

- 考虑稳定核心API，减少破坏性变更
- 使用版本控制，明确标记不同版本的API行为
- 将示例代码放在单独文件中，便于测试和更新

### 3. 如何确保文档持续更新？

- 将文档更新纳入代码审查流程
- 定期进行文档审计
- 考虑使用工具检测未文档化的公共API

## 文档模板

### 工具函数文档模板

```markdown
## 函数名称

`functionName(param1, param2)`

**说明**: 函数功能的简要说明。

**参数**:
- `param1` {Type}: 参数1的说明
- `param2` {Type}: 参数2的说明

**返回值**: {Type} 返回值的说明

**示例**:
```javascript
// 使用示例
const result = functionName('value1', 42);
console.log(result);
```
```

### 组件文档模板

```markdown
## 组件名称

**文件路径**: `components/componentName/componentName.js`

**说明**: 组件的用途和功能概述。

**属性**:
- `prop1` {Type} [默认值]: 属性1的说明
- `prop2` {Type} [默认值]: 属性2的说明

**事件**:
- `event1`: 事件1触发的条件和携带的数据
- `event2`: 事件2触发的条件和携带的数据

**插槽**:
- `default`: 默认插槽的用途
- `named`: 命名插槽的用途

**使用示例**:
```html
<component-name
  prop1="value1"
  prop2="value2"
  bind:event1="onEvent1"
>
  内容
</component-name>
```
```

### 服务文档模板

```markdown
## 服务名称

**文件路径**: `services/serviceName.js`

**说明**: 服务的职责和功能概述。

**方法**:
- `methodName(param)`: 方法的说明
  - 参数: `param` {Type} - 参数说明
  - 返回: {Type} 返回值说明
  - 示例:
    ```javascript
    const result = serviceManager.getService('serviceName').methodName('value');
    ```

**依赖**:
- 列出服务依赖的其他服务或组件

**使用示例**:
```javascript
// 获取服务
const service = serviceManager.getService('serviceName');

// 调用方法
service.methodName('value')
  .then(result => {
    console.log(result);
  })
  .catch(error => {
    console.error(error);
  });
```
``` 