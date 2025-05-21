# 数据模型设计

本文档详细描述了学习任务微信小程序的核心数据模型，包括任务、消息等数据结构和处理逻辑。

## 任务数据模型

### 任务对象结构

任务对象是应用的核心数据模型，结构如下：

```javascript
{
  id: 'task_123456789_123',      // 任务唯一ID
  title: '练习钢琴',              // 任务标题
  description: '练习新曲目30分钟', // 任务描述
  type: 'study',                 // 任务类型: 'study'(学习)/'habit'(习惯)/'interest'(兴趣)
  date: '2023-05-23',            // 任务日期，YYYY-MM-DD格式
  createTime: 1621693875000,     // 创建时间戳
  modifyTime: 1621693875000,     // 修改时间戳
  status: 0,                     // 任务状态: 0(未完成)/1(已完成)/'canceled'(已取消)/'overdue'(已逾期)
  priority: 'medium',            // 任务优先级: 'high'/'medium'/'low'
  
  // 必做任务相关属性
  isRequired: false,             // 是否为必做任务
  penaltyApplied: false,         // 是否已应用惩罚(针对未完成的必做任务)
  
  // 学习任务特有字段
  startTime: '08:00',            // 开始时间
  endTime: '08:30',              // 结束时间
  duration: 30,                  // 持续时间(分钟)
  
  // 重复任务配置
  repeat: {
    type: 'daily',               // 重复类型: 'none'/'daily'/'weekly'/'workdays'/'weekends'/'custom'
    startDate: '2023-05-23',     // 开始日期
    endDate: '2023-06-23',       // 结束日期
    days: ['0','1','5']          // 当type为custom时，指定重复的星期几(0-6)
  },
  
  // 完成记录
  completionRecords: [
    {
      date: '2023-05-23',        // 完成日期
      timestamp: 1621693875000,  // 完成时间戳
      notes: '提前完成了'         // 完成备注
    }
  ],
  
  // 奖励点数
  points: 10,                    // 完成可获得的奖励点数（星星数量）
  starAwarded: false,            // 是否已经获得过星星（防止重复获取）
  
  // 积分有效期
  pointsExpiry: 'month',         // 积分有效期类型：'permanent'/'week'/'month'/'3months'/'6months'/'12months'
  pointsExpiryDate: '完成后一个月', // 积分有效期显示文本（已完成任务显示具体日期）
  
  // 任务标签
  tags: ['音乐', '练习'],
  
  // 任务提醒设置
  reminder: {
    enabled: true,               // 是否启用提醒
    time: 15,                    // 提前几分钟提醒（分钟数）
  },
  
  // 照片记录（针对学习任务）
  photos: [
    'wxfile://temp_photo_123.jpg'
  ],
  
  // 父任务ID（用于重复任务）
  parentTaskId: 'task_123456789_000' // 重复任务的原始任务ID
}
```

### 任务类型定义

项目支持三种类型的任务：

1. **学习任务 (study)**
   - 有明确的开始时间和结束时间
   - 通常与学业相关
   - 默认持续时间：60分钟
   - 支持上传照片记录完成情况
   - 示例：语文作业、数学练习、阅读

2. **习惯任务 (habit)**
   - 培养良好习惯的任务
   - 通常需要重复执行
   - 默认持续时间：10分钟
   - 支持连续完成天数统计
   - 示例：每天喝水、早起、整理房间

3. **兴趣任务 (interest)**
   - 与兴趣爱好相关的活动
   - 培养多元化发展
   - 默认持续时间：30分钟
   - 支持进度追踪
   - 示例：画画、弹钢琴、运动

### 任务优先级

任务支持三种优先级：
- `high`: 高优先级，以红色标识
- `medium`: 中优先级，以黄色标识
- `low`: 低优先级，以蓝色标识

### 任务状态流转

任务状态包括：
- `0`: 未完成（数值类型）
- `1`: 已完成（数值类型）
- `canceled`: 已取消（字符串类型）
- `overdue`: 已逾期（字符串类型）

状态流转通过 `taskManager.updateTaskStatus()` 方法实现：

```javascript
taskManager.updateTaskStatus(taskId, status, callback);
```

状态变更时的业务逻辑：
- 当任务状态从未完成变为已完成时，如果任务未获得过星星，则添加对应积分并计算积分有效期
- 当任务状态从已完成变为未完成时，扣除对应积分，重置有效期显示
- 对于必做任务，未完成并且过期的会自动标记为已逾期并应用惩罚

## 必做任务机制

必做任务是一种特殊的任务类型，具有以下特点：
- 用 `isRequired` 字段标记
- 如果未完成，将扣除积分作为惩罚
- 可以通过 `taskManager.markTaskAsRequired()` 标记为必做任务
- 可以通过 `taskManager.unmarkTaskAsRequired()` 取消标记
- 逾期未完成的必做任务会创建惩罚消息并扣除积分

```javascript
// 标记为必做任务
taskManager.markTaskAsRequired(taskId, callback);

// 取消必做任务标记
taskManager.unmarkTaskAsRequired(taskId, callback);
```

## 积分有效期

任务完成后获得的积分有以下有效期选项，所有有效期都按自然周期计算：
- `permanent`: 永久有效
- `week`: 到当前自然周的周日24点（如周日完成则当天24点失效）
- `month`: 到当前自然月的最后一天24点（如月末完成则当天24点失效）
- `3months`: 到当前自然季度的最后一天24点（如季末完成则当天24点失效）
- `6months`: 到当前自然半年的最后一天24点（如半年末完成则当天24点失效）
- `12months`: 到当前自然年的12月31日24点（如年末完成则当天24点失效）

积分有效期在代码中的处理：
- 使用 `pointsExpiry` 存储有效期类型
- 使用 `pointsExpiryDate` 存储格式化的有效期显示文本
- 文本映射关系在 `Constants.POINTS_EXPIRY.TEXT` 中定义
- 任务完成时使用 `calculateExpiryDate` 方法计算准确的到期日期

## 星星分组数据模型

星星分组用于管理不同有效期的星星，实现"先过期先消费"的星星使用策略：

```javascript
{
  id: 'group_123456789',       // 星星分组ID
  expiryType: 'month',         // 有效期类型，同积分有效期类型
  expiryDate: 1627776000000,   // 过期时间戳
  expiryDateText: '2023-08-01', // 格式化的过期日期
  points: 20,                  // 该分组中的星星数量
  source: 'task',              // 星星来源类型：'task'(任务)/'system'(系统)/'bonus'(奖励)
  sourceId: 'task_123456789',  // 星星来源ID
  createTime: 1621693875000,   // 创建时间
  status: 'active'             // 状态：'active'(活跃)/'expired'(已过期)/'consumed'(已消费完)
}
```

## 星星记录数据模型

星星记录用于跟踪星星的流转历史：

```javascript
{
  id: 'record_123456789',      // 记录ID
  type: 'earn',                // 记录类型：'earn'(获取)/'consume'(消费)/'expire'(过期)
  amount: 10,                  // 星星数量
  balance: 100,                // 操作后的星星余额
  timestamp: 1621693875000,    // 记录时间戳
  description: '完成任务"练习钢琴"', // 描述
  source: 'task',              // 来源类型：'task'/'reward'/'system'/'expiry'
  sourceId: 'task_123456789',  // 来源ID
  data: {                      // 额外数据，根据类型不同而不同
    taskId: 'task_123456789',  // 相关任务ID（如果适用）
    rewardId: 'reward_123',    // 相关奖励ID（如果适用）
    expiryType: 'month'        // 过期类型（如果适用）
  }
}
```

## 奖励数据模型

奖励系统使用以下数据结构管理奖励：

```javascript
{
  id: 'reward_123456789',      // 奖励唯一ID
  name: '购买玩具车',           // 奖励名称
  description: '从商店购买一个喜欢的玩具车', // 奖励描述
  type: 'item',                // 奖励类型: 'item'(物品)/'privilege'(特权)/'activity'(活动)
  points: 50,                  // 兑换所需的星星数量
  icon: '🚗',                   // 奖励图标（使用emoji）
  enabled: true,               // 是否启用
  claimed: false,              // 是否已被兑换
  claimTime: 0,                // 兑换时间戳（未兑换为0）
  claimStatus: 'available',    // 兑换状态: 'available'(可兑换)/'claimed'(已兑换未领取)/'delivered'(已领取)/'disabled'(已禁用)
  deliveryTime: 0,             // 领取时间戳（未领取为0）
  createTime: 1621693875000,   // 创建时间戳
  isExample: false,            // 是否为示例奖励
  tags: ['玩具', '车'],         // 奖励标签
  notes: '生日礼物'             // 奖励备注
}
```

### 奖励状态流转

奖励的状态流转如下：

1. **可兑换 (available)**
   - 默认初始状态
   - 已启用且未被兑换的奖励
   - 用户可以消费星星兑换此奖励

2. **已兑换未领取 (claimed)**
   - 用户已使用星星兑换，但尚未实际领取奖励
   - 系统已扣除相应星星数
   - 在兑换记录中显示为"待领取"

3. **已领取 (delivered)**
   - 用户已经实际领取奖励
   - 管理者可以将状态从已兑换更新为已领取
   - 在兑换记录中显示为"已领取"

4. **已禁用 (disabled)**
   - 管理者禁用了此奖励
   - 不再显示在可兑换奖励列表中
   - 示例奖励不能被禁用

### 奖励类型

系统支持三种奖励类型：

1. **物品奖励 (item)**
   - 实物礼品，如玩具、图书等
   - 需要家长/老师实际提供
   - 示例：玩具车、积木套装、图书

2. **特权奖励 (privilege)**
   - 特殊权限或待遇
   - 示例：额外的电子设备使用时间、选择晚餐菜单

3. **活动奖励 (activity)**
   - 特殊活动或体验
   - 示例：去游乐园、电影院、参加特定活动

### 示例奖励机制

系统包含示例奖励功能：
- 首次启动时初始化默认示例奖励
- 示例奖励使用 `isExample: true` 标记
- 当用户创建第一个自定义奖励时，自动清理未领取的示例奖励
- 示例奖励不能被禁用
- 当存在自定义奖励时，示例奖励不会再显示

## 进度数据模型

进度数据模型用于跟踪任务完成情况和统计数据：

```javascript
{
  taskId: string,           // 关联的任务ID
  progress: number,         // 当前进度百分比
  completed: boolean,       // 是否已完成
  lastUpdate: string,       // 最后更新时间
  history: [{               // 进度历史记录
    date: string,           // 记录日期
    progress: number,       // 当时的进度
    status: string          // 当时的状态
  }],
  statistics: {             // 统计数据
    completionRate: number, // 完成率
    averageTime: number,    // 平均用时
    streakDays: number      // 连续完成天数
  }
}
```

## 消息数据模型

消息数据用于系统通知和任务提醒：

```javascript
{
  id: string,               // 消息ID
  type: string,             // 消息类型：'task'/'system'/'reward'/'penalty'
  title: string,            // 消息标题
  summary: string,          // 消息摘要
  content: string,          // 消息内容
  timestamp: number,        // 消息时间戳
  isRead: boolean,          // 是否已读
  icon: string,             // 消息图标
  taskId: string,           // 相关任务ID（如果适用）
  action: {                 // 消息操作
    type: string,           // 操作类型
    data: any               // 操作参数
  }
}
```

## 数据存储与同步

应用使用微信小程序的本地存储机制保存数据：

```javascript
// 保存任务数据
wx.setStorageSync('taskData', tasks);

// 读取任务数据
const tasks = wx.getStorageSync('taskData') || [];
```

为提高性能，应用采用批量处理机制处理大量数据：

```javascript
// 批量处理任务数据
taskManager.batchProcessTasks(items, processFn, {
  batchSize: 50,   // 每批处理数量
  delay: 10,       // 批次间延迟（毫秒）
  showProgress: true  // 是否显示进度
}, callback);
``` 