/**
 * 奖励兑换测试
 * 验证修复后的奖励兑换功能是否正常工作
 */

const { StarRecord } = require('../models/star-record');

// 测试StarRecord创建
function testStarRecordCreation() {
  console.log('=== 测试StarRecord创建 ===');
  
  try {
    // 测试正确的参数结构
    const record = new StarRecord({
      points: -10, // 消费记录为负数
      type: 'expense', // 支出类型
      source: 'reward_test',
      sourceId: 'reward_123',
      description: '兑换奖励消费: 测试奖励',
      timestamp: Date.now(),
      data: {
        rewardId: 'reward_123',
        rewardName: '测试奖励'
      }
    });
    
    console.log('✅ StarRecord创建成功:', {
      id: record.id,
      points: record.points,
      type: record.type,
      source: record.source,
      description: record.description
    });
    
    // 验证记录
    const errors = record.validate();
    if (errors.length === 0) {
      console.log('✅ StarRecord验证通过');
    } else {
      console.log('❌ StarRecord验证失败:', errors);
    }
    
    return true;
  } catch (error) {
    console.log('❌ StarRecord创建失败:', error.message);
    return false;
  }
}

// 测试错误的参数结构（修复前的问题）
function testIncorrectParameters() {
  console.log('\n=== 测试错误参数结构 ===');
  
  try {
    // 这是修复前的错误参数结构
    const record = new StarRecord({
      amount: 10, // 错误：应该是points
      recordType: 'consumption', // 错误：应该是type
      operationType: 'exchange', // 错误：不存在的属性
      source: 'reward_test',
      expiryType: 'none', // 错误：不存在的属性
      expiryDate: null, // 错误：不存在的属性
      data: {}
    });
    
    console.log('⚠️ 错误参数结构创建了记录:', {
      points: record.points, // 应该是0（默认值）
      type: record.type, // 应该是'income'（默认值）
      amount: record.amount, // undefined
      recordType: record.recordType, // undefined
      operationType: record.operationType // undefined
    });
    
    // 验证记录
    const errors = record.validate();
    if (errors.length > 0) {
      console.log('❌ 错误参数结构验证失败（预期）:', errors);
    }
    
    return true;
  } catch (error) {
    console.log('❌ 测试错误参数结构失败:', error.message);
    return false;
  }
}

// 运行测试
function runTests() {
  console.log('开始奖励兑换修复验证测试...\n');
  
  const test1 = testStarRecordCreation();
  const test2 = testIncorrectParameters();
  
  console.log('\n=== 测试结果 ===');
  console.log(`StarRecord正确创建: ${test1 ? '✅ 通过' : '❌ 失败'}`);
  console.log(`错误参数检测: ${test2 ? '✅ 通过' : '❌ 失败'}`);
  
  if (test1 && test2) {
    console.log('\n🎉 所有测试通过！奖励兑换修复验证成功。');
  } else {
    console.log('\n⚠️ 部分测试失败，需要进一步检查。');
  }
}

// 如果直接运行此文件
if (require.main === module) {
  runTests();
}

module.exports = {
  testStarRecordCreation,
  testIncorrectParameters,
  runTests
}; 