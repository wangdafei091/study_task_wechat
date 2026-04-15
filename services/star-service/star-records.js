const logger = require('../../utils/logger');

async function getStarGroups(service, userId = null) {
  try {
    const groups = await service.starGroupRepository.getNonEmptyGroups(userId);
    logger.info('StarService', `获取星星分组列表成功${userId ? `, 用户=${userId}` : ''}, 数量=${groups.length}`);
    return groups;
  } catch (error) {
    logger.error('StarService', '获取星星分组列表失败', error);
    return [];
  }
}

async function getTotalStars(service, userId = null) {
  try {
    const total = await service.starGroupRepository.getTotalPoints(userId);
    logger.info('StarService', `获取用户总星星数量成功${userId ? `, 用户=${userId}` : ''}: ${total}`);
    return total;
  } catch (error) {
    logger.error('StarService', '获取用户总星星数量失败', error);
    return 0;
  }
}

async function getStarRecords(service, options = {}) {
  try {
    let records = [];
    const { userId } = options;

    if (options.type && options.date) {
      records = await service.starRecordRepository.getRecordsByTypeAndDate(options.type, options.date, userId);
    } else if (options.type) {
      records = await service.starRecordRepository.getRecordsByType(options.type, userId);
    } else if (options.date) {
      records = await service.starRecordRepository.getRecordsByDate(options.date, userId);
    } else {
      records = await service.starRecordRepository.getRecordsByTimeOrder(true, options.limit || 0, userId);
    }

    logger.info('StarService', `获取星星记录列表成功${userId ? `, 用户=${userId}` : ''}, 数量=${records.length}`);
    return records;
  } catch (error) {
    logger.error('StarService', '获取星星记录列表失败', error);
    return [];
  }
}

async function getStarRecordsByMonth(service, userId = null) {
  try {
    const groupedRecords = await service.starRecordRepository.getRecordsGroupedByMonth({ userId });
    logger.info('StarService', `获取按月份分组的星星记录成功${userId ? `, 用户=${userId}` : ''}, 月份数=${groupedRecords.length}`);
    return groupedRecords;
  } catch (error) {
    logger.error('StarService', '获取按月份分组的星星记录失败', error);
    return [];
  }
}

async function getStarRecordsByDateRange(service, startDate, endDate, userId = null) {
  try {
    logger.info('StarService', `获取日期范围星星记录: ${startDate} 至 ${endDate}${userId ? `, 用户=${userId}` : ''}`);
    const records = await service.starRecordRepository.getRecordsByDateRange(startDate, endDate, userId);
    logger.info('StarService', `获取日期范围星星记录成功, 数量=${records.length}`);
    return records;
  } catch (error) {
    logger.error('StarService', `获取日期范围星星记录失败: ${startDate} 至 ${endDate}`, error);
    return [];
  }
}

async function getStarRecordsByDate(service, date, userId = null) {
  try {
    logger.info('StarService', `获取特定日期星星记录: ${date}${userId ? `, 用户=${userId}` : ''}`);
    const records = await service.starRecordRepository.getRecordsByDate(date, userId);
    logger.info('StarService', `获取特定日期星星记录成功, 数量=${records.length}`);
    return records;
  } catch (error) {
    logger.error('StarService', `获取特定日期星星记录失败: ${date}`, error);
    return [];
  }
}

async function validateConsistency(service) {
  logger.info('StarService', '开始验证星星数据一致性');

  try {
    const groups = await service.starGroupRepository.getAll();
    const groupsTotal = groups.reduce((sum, group) => sum + (group.stars || 0), 0);
    const records = await service.starRecordRepository.getAll();
    const recordsCalculation = service._calculateBalanceFromRecords(records);
    const isConsistent = groupsTotal === recordsCalculation.finalBalance;

    const result = {
      isConsistent,
      groupsTotal,
      recordsBalance: recordsCalculation.finalBalance,
      difference: groupsTotal - recordsCalculation.finalBalance,
      groupsCount: groups.length,
      recordsCount: records.length
    };

    logger.info('StarService', `星星数据一致性验证结果: ${JSON.stringify(result)}`);
    return result;
  } catch (error) {
    logger.error('StarService', '验证星星数据一致性失败', error);
    return {
      isConsistent: false,
      error: error.message
    };
  }
}

function calculateBalanceFromRecords(service, records) {
  let income = 0;
  let expense = 0;

  records.forEach(record => {
    if (record.points > 0) {
      income += record.points;
    } else {
      expense += Math.abs(record.points);
    }
  });

  return {
    income,
    expense,
    finalBalance: income - expense
  };
}

async function repairStarRecordBalances(service) {
  logger.info('StarService', '开始修复星星记录的余额信息');

  try {
    const result = await service.starRecordRepository.repairRecordBalances();

    if (result.success) {
      logger.info('StarService', `星星记录余额修复完成，共修复${result.repairedCount}条记录`);
      service.clearCache();
    } else {
      logger.error('StarService', `星星记录余额修复失败: ${result.error}`);
    }

    return result;
  } catch (error) {
    logger.error('StarService', '修复星星记录余额失败', error);
    return { success: false, error: error.message };
  }
}

async function checkAndRepairDataConsistency(service) {
  logger.info('StarService', '开始检查并修复数据一致性');

  try {
    if (service.enableCloudStorage) {
      logger.info('StarService', '云端模式跳过本地星星一致性检查和修复');
      return {
        success: true,
        skipped: true,
        reason: 'cloud_mode',
        initialConsistency: null,
        repairResult: {
          success: true,
          repairedCount: 0,
          skipped: true
        },
        finalConsistency: null,
        isFixed: true
      };
    }

    const consistencyResult = await service.validateConsistency();
    const repairResult = await service.repairStarRecordBalances();
    const finalConsistencyResult = await service.validateConsistency();

    const result = {
      success: true,
      initialConsistency: consistencyResult,
      repairResult,
      finalConsistency: finalConsistencyResult,
      isFixed: finalConsistencyResult.isConsistent
    };

    logger.info('StarService', '数据一致性检查和修复完成:', {
      初始一致性: consistencyResult.isConsistent,
      修复记录数: repairResult.repairedCount,
      最终一致性: finalConsistencyResult.isConsistent
    });

    return result;
  } catch (error) {
    logger.error('StarService', '检查并修复数据一致性失败', error);
    return { success: false, error: error.message };
  }
}

async function verifyOperationConsistency(service, operation, operationData = {}) {
  logger.info('StarService', `验证${operation}操作后的数据一致性`);

  try {
    const groupsTotal = await service.starGroupRepository.getTotalPoints();
    const records = await service.starRecordRepository.getAll();
    const recordsCalculation = service._calculateBalanceFromRecords(records);
    const isConsistent = groupsTotal === recordsCalculation.finalBalance;

    logger.info('StarService', `${operation}操作后数据一致性检查: 分组总数=${groupsTotal}, 记录余额=${recordsCalculation.finalBalance}, 一致性=${isConsistent}`);

    if (!isConsistent) {
      logger.error('StarService', `${operation}操作后数据不一致！`, {
        operation,
        operationData,
        groupsTotal,
        recordsBalance: recordsCalculation.finalBalance,
        difference: groupsTotal - recordsCalculation.finalBalance
      });
    }

    return isConsistent;
  } catch (error) {
    logger.error('StarService', `验证${operation}操作后数据一致性失败`, error);
    return false;
  }
}

function calculateRecordBalance(service, records, currentBalance) {
  logger.info('StarService', `计算记录余额，当前总星星数：${currentBalance}`);
  const sortedRecords = [...records].sort((a, b) => b.timestamp - a.timestamp);
  const result = [];
  let runningBalance = currentBalance;

  for (let i = 0; i < sortedRecords.length; i++) {
    const record = { ...sortedRecords[i] };
    record.points = parseInt(record.points, 10);
    record.balance = parseInt(runningBalance, 10);
    result.push(record);
    runningBalance = runningBalance - record.points;
  }

  logger.info('StarService', `记录余额计算完成，处理了${result.length}条记录`);
  return result;
}

function calculateMonthSummary(service, groupedRecords) {
  logger.info('StarService', `计算月度汇总，共${groupedRecords.length}个月份`);

  return groupedRecords.map(group => {
    const records = group.records || [];
    let incomeTotal = 0;
    let expenseTotal = 0;

    records.forEach(record => {
      if (record.points > 0) {
        incomeTotal += record.points;
      } else {
        expenseTotal += Math.abs(record.points);
      }
    });

    const netChange = incomeTotal - expenseTotal;
    const summary = netChange >= 0
      ? `本月共获得 ${parseInt(incomeTotal, 10)} 颗星星`
      : `本月共使用 ${parseInt(expenseTotal, 10)} 颗星星`;

    return {
      ...group,
      monthSummary: summary,
      incomeTotal: parseInt(incomeTotal, 10),
      expenseTotal: parseInt(expenseTotal, 10),
      netChange
    };
  });
}

function groupRecordsByMonth(service, records) {
  logger.info('StarService', '开始按月份分组记录');
  const monthGroups = {};

  records.forEach(record => {
    if (!record.timestamp) {
      return;
    }

    const date = new Date(record.timestamp);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    if (!monthGroups[monthKey]) {
      monthGroups[monthKey] = {
        month: monthKey,
        monthText: `${date.getFullYear()}年${date.getMonth() + 1}月`,
        records: []
      };
    }

    monthGroups[monthKey].records.push(record);
  });

  const result = Object.values(monthGroups);
  result.sort((a, b) => b.month.localeCompare(a.month));
  logger.info('StarService', `月份分组完成，共${result.length}个月份`);
  return result;
}

function filterRecords(service, records, typeFilter, timeFilter) {
  logger.info('StarService', `筛选记录，类型：${typeFilter}，时间：${timeFilter}`);
  let filtered = [...records];

  logger.info('StarService', `筛选前记录数量：${records.length}`);
  if (records.length > 0) {
    logger.info('StarService', `第一条记录类型：${records[0].type}，点数：${records[0].points}，标题：${records[0].title || records[0].description}`);
  }

  if (typeFilter !== 'all') {
    filtered = filtered.filter(record => record.type === typeFilter);
    logger.info('StarService', `类型筛选后记录数量：${filtered.length}`);
  }

  if (timeFilter !== 'all') {
    const now = Date.now();
    let timeThreshold = now;

    if (timeFilter === 'week') {
      timeThreshold = now - (7 * 24 * 60 * 60 * 1000);
    } else if (timeFilter === 'month') {
      timeThreshold = now - (30 * 24 * 60 * 60 * 1000);
    } else if (timeFilter === '3months') {
      timeThreshold = now - (90 * 24 * 60 * 60 * 1000);
    }

    filtered = filtered.filter(record => record.timestamp >= timeThreshold);
    logger.info('StarService', `时间筛选后记录数量：${filtered.length}`);
  }

  logger.info('StarService', `最终筛选结果：${filtered.length}条记录`);
  return filtered;
}

function clearCache(service) {
  logger.info('StarService', '清除星星服务缓存');

  if (service.starGroupRepository && service.starGroupRepository.clearCache) {
    service.starGroupRepository.clearCache();
  }

  if (service.starRecordRepository && service.starRecordRepository.clearCache) {
    service.starRecordRepository.clearCache();
  }

  service._familySummaryCache = null;
  service._familySummaryInFlight = null;
}

module.exports = {
  getStarGroups,
  getTotalStars,
  getStarRecords,
  getStarRecordsByMonth,
  getStarRecordsByDateRange,
  getStarRecordsByDate,
  validateConsistency,
  calculateBalanceFromRecords,
  repairStarRecordBalances,
  checkAndRepairDataConsistency,
  verifyOperationConsistency,
  calculateRecordBalance,
  calculateMonthSummary,
  groupRecordsByMonth,
  filterRecords,
  clearCache
};
