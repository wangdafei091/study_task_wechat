# ValidationService API 文档

> 统一的表单验证服务，提供业务级别的验证逻辑和通用字段验证功能

## 概述

ValidationService 是项目中统一的表单验证服务，负责处理：
- 任务表单验证
- 奖励表单验证 
- 通用字段验证（文本、数字、日期等）
- 数据组装和标准化

## 获取服务实例

```javascript
// 通过ServiceManager获取
const validationService = serviceManager.getService('validation');
// 或者使用别名
const validationService = serviceManager.getService('validationService');
```

## API 方法

### validateTaskForm(taskData)

验证任务表单数据

**参数:**
- `taskData` (Object) - 任务数据对象

**返回值:**
```javascript
{
  valid: boolean,        // 验证是否通过
  errorMsg: string,      // 错误信息（验证失败时）
  data: Object          // 组装后的任务数据（验证通过时）
}
```

**示例:**
```javascript
const taskData = {
  title: '学习任务',
  startDate: '2024-01-01',
  isAllDay: false,
  startTime: '09:00',
  endTime: '17:00',
  type: 'study',
  points: 5,
  isRequired: true
};

const result = validationService.validateTaskForm(taskData);
if (result.valid) {
  console.log('验证通过:', result.data);
} else {
  console.log('验证失败:', result.errorMsg);
}
```

### validateRewardForm(rewardData)

验证奖励表单数据

**参数:**
- `rewardData` (Object) - 奖励数据对象

**返回值:**
```javascript
{
  valid: boolean,        // 验证是否通过
  errorMsg: string,      // 错误信息（验证失败时）
  data: Object          // 组装后的奖励数据（验证通过时）
}
```

**示例:**
```javascript
const rewardData = {
  name: '小玩具',
  requiredStars: 10,
  description: '奖励描述',
  isActive: true
};

const result = validationService.validateRewardForm(rewardData);
```

### validateTextField(value, fieldName, options)

验证文本字段

**参数:**
- `value` (String) - 字段值
- `fieldName` (String) - 字段名称（用于错误提示）
- `options` (Object) - 验证选项
  - `required` (Boolean) - 是否必填，默认true
  - `minLength` (Number) - 最小长度，默认0
  - `maxLength` (Number) - 最大长度，默认200
  - `trim` (Boolean) - 是否自动去除首尾空格，默认true

**返回值:**
```javascript
{
  valid: boolean,        // 验证是否通过
  errorMsg: string,      // 错误信息（验证失败时）
  value: string         // 处理后的值
}
```

**示例:**
```javascript
const result = validationService.validateTextField(
  '用户输入的文本',
  '任务标题',
  { required: true, maxLength: 50 }
);
```

### validateNumberField(value, fieldName, options)

验证数字字段

**参数:**
- `value` (Number|String) - 字段值
- `fieldName` (String) - 字段名称
- `options` (Object) - 验证选项
  - `required` (Boolean) - 是否必填，默认true
  - `min` (Number) - 最小值，默认0
  - `max` (Number) - 最大值，默认Number.MAX_SAFE_INTEGER
  - `integer` (Boolean) - 是否必须为整数，默认false

**返回值:**
```javascript
{
  valid: boolean,        // 验证是否通过
  errorMsg: string,      // 错误信息（验证失败时）
  value: number         // 转换后的数值
}
```

**示例:**
```javascript
const result = validationService.validateNumberField(
  '10',
  '所需星星数',
  { required: true, min: 1, max: 100, integer: true }
);
```

### validateDateField(dateValue, fieldName, options)

验证日期字段

**参数:**
- `dateValue` (String) - 日期值（YYYY-MM-DD格式）
- `fieldName` (String) - 字段名称
- `options` (Object) - 验证选项
  - `required` (Boolean) - 是否必填，默认true
  - `minDate` (String) - 最早日期
  - `maxDate` (String) - 最晚日期

**返回值:**
```javascript
{
  valid: boolean,        // 验证是否通过
  errorMsg: string,      // 错误信息（验证失败时）
  value: string         // 日期值
}
```

**示例:**
```javascript
const result = validationService.validateDateField(
  '2024-01-01',
  '开始日期',
  { required: true, minDate: '2024-01-01' }
);
```

## 验证规则

### 任务表单验证规则

1. **标题验证**：必填，不能为空或只包含空格
2. **日期验证**：必须选择开始日期
3. **重复任务验证**：
   - 如果是重复任务且未勾选"无结束日期"，必须设置结束日期
   - 结束日期不能早于开始日期
4. **时间验证**：非全天任务必须设置开始和结束时间

### 奖励表单验证规则

1. **名称验证**：必填，不能为空
2. **所需星星数验证**：必须大于0的整数

### 通用字段验证规则

1. **文本字段**：支持长度限制、必填验证、自动去除空格
2. **数字字段**：支持数值范围、整数验证、类型转换
3. **日期字段**：支持日期格式验证、日期范围限制

## 最佳实践

### 页面层使用模式

```javascript
// 1. 获取验证服务
const validationService = serviceManager.getService('validation');

// 2. 检查服务可用性（降级处理）
if (!validationService) {
  logger.error('页面名称', '无法获取验证服务，使用本地验证');
  return this.validateFormLocal();
}

// 3. 使用服务层验证
const validationResult = validationService.validateTaskForm(formData);

// 4. 处理验证结果
if (validationResult.valid) {
  // 使用验证通过的数据
  const taskData = validationResult.data;
  // ... 业务处理
} else {
  // 显示错误信息
  wx.showToast({
    title: validationResult.errorMsg,
    icon: 'none'
  });
}
```

### 降级处理机制

每个使用ValidationService的页面都应该包含降级处理：

```javascript
validateForm: function() {
  const validationService = serviceManager.getService('validation');
  
  if (validationService) {
    // 使用服务层验证
    return validationService.validateTaskForm(this.data.formData);
  } else {
    // 降级到本地验证
    return this.validateFormLocal();
  }
},

validateFormLocal: function() {
  // 本地验证逻辑作为备选方案
  // ...
}
```

## 错误处理

ValidationService 在遇到异常时会：
1. 记录详细的错误日志
2. 返回标准化的错误结果
3. 不会抛出异常，确保页面稳定性

```javascript
// 典型的错误返回格式
{
  valid: false,
  errorMsg: '具体的错误描述',
  data: null
}
```

## 注意事项

1. **服务依赖**：ValidationService 无外部依赖，可独立使用
2. **性能考虑**：验证操作是同步的，不会产生性能开销
3. **扩展性**：可以通过添加新的验证方法来扩展功能
4. **一致性**：所有验证错误信息使用统一的中文提示 