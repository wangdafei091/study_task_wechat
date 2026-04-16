const logger = require('../../utils/logger');
const { StarExpiryType } = require('../../models/star');
const { StarGroup } = require('../../models/star-group');
const { EVENTS } = require('../../utils/constants');

const STAR_REMIND_WINDOW_DAYS = 3;
const STAR_PROTECT_WINDOW_HOURS = 48;
const AVAILABLE_BUCKETS = [
  { key: StarExpiryType.WEEK, label: '本周到期' },
  { key: StarExpiryType.MONTH, label: '本月到期' },
  { key: StarExpiryType.QUARTER, label: '本季度到期' },
  { key: StarExpiryType.PERMANENT, label: '永久有效' }
];

function buildEmptyExpiringInfo() {
  return {
    points: 0,
    expiryDateText: '',
    expiryTimestamp: 0,
    remindWindowDays: STAR_REMIND_WINDOW_DAYS,
    protectWindowDays: STAR_PROTECT_WINDOW_HOURS / 24
  };
}

function normalizeGroup(service, group) {
  const expiryMeta = service._resolveExpiryMetadata(
    group.expiryDate || group.expiryDateStr,
    group.expiryDateStr || ''
  );

  if (expiryMeta.timestamp === null) {
    return new StarGroup({
      ...group,
      type: group.type || group.expiryType || StarExpiryType.PERMANENT,
      expiryType: group.expiryType || group.type || StarExpiryType.PERMANENT,
      expiryDate: '',
      expiryDateStr: expiryMeta.displayText || ''
    });
  }

  return new StarGroup({
    ...group,
    type: group.type || group.expiryType || StarExpiryType.PERMANENT,
    expiryType: group.expiryType || group.type || StarExpiryType.PERMANENT,
    expiryDate: expiryMeta.timestamp,
    expiryDateStr: expiryMeta.displayText
  });
}

async function getNormalizedGroups(service, userId = null) {
  const allGroups = await service.starGroupRepository.getAll();
  const filteredGroups = userId
    ? allGroups.filter((group) => group.userId === userId)
    : allGroups;

  return filteredGroups.map((group) => normalizeGroup(service, group));
}

function getValidAvailableGroups(groups) {
  return (groups || []).filter((group) => (
    Number(group?.stars || 0) > 0 && !group.isExpired()
  ));
}

function buildExpiringInfo(service, validGroups) {
  const expiringGroups = (validGroups || []).filter((group) => (
    group.expiryType !== StarExpiryType.PERMANENT
    && service._isGroupWithinReminderWindow(group)
  ));

  if (expiringGroups.length === 0) {
    return buildEmptyExpiringInfo();
  }

  expiringGroups.sort((a, b) => {
    if (!a.expiryDate) return 1;
    if (!b.expiryDate) return -1;
    return a.expiryDate - b.expiryDate;
  });

  const earliestGroup = expiringGroups[0];
  const expiringPoints = expiringGroups
    .filter((group) => group.expiryDate === earliestGroup.expiryDate)
    .reduce((sum, group) => sum + (group.stars || 0), 0);

  return {
    points: expiringPoints,
    expiryDateText: earliestGroup.expiryDateStr || '',
    expiryTimestamp: earliestGroup.expiryDate || 0,
    remindWindowDays: STAR_REMIND_WINDOW_DAYS,
    protectWindowDays: STAR_PROTECT_WINDOW_HOURS / 24
  };
}

function buildAvailableStarComposition(validGroups, expiringInfo) {
  const bucketTotals = AVAILABLE_BUCKETS.reduce((result, bucket) => {
    result[bucket.key] = 0;
    return result;
  }, {});

  (validGroups || []).forEach((group) => {
    const bucketKey = AVAILABLE_BUCKETS.some((bucket) => bucket.key === group.expiryType)
      ? group.expiryType
      : StarExpiryType.PERMANENT;
    bucketTotals[bucketKey] += Number(group.stars || 0);
  });

  return AVAILABLE_BUCKETS
    .map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      points: bucketTotals[bucket.key],
      emphasized: expiringInfo.expiryTimestamp > 0 && bucket.key === (
        (validGroups || []).find((group) => group.expiryDate === expiringInfo.expiryTimestamp)?.expiryType || ''
      )
    }))
    .filter((bucket) => bucket.points > 0);
}

async function getAvailableStarSnapshot(service, userId = null) {
  try {
    const normalizedGroups = await getNormalizedGroups(service, userId);
    const validGroups = getValidAvailableGroups(normalizedGroups);
    const expiringInfo = buildExpiringInfo(service, validGroups);
    const buckets = buildAvailableStarComposition(validGroups, expiringInfo);
    const totalStars = validGroups.reduce((sum, group) => sum + (group.stars || 0), 0);

    const snapshot = {
      userId,
      totalStars,
      buckets,
      expiringInfo
    };

    logger.info('StarService', `当前可用星星快照计算完成${userId ? `, 用户=${userId}` : ''}`, snapshot);
    return snapshot;
  } catch (error) {
    logger.error('StarService', '获取当前可用星星快照失败', error);
    return {
      userId,
      totalStars: 0,
      buckets: [],
      expiringInfo: buildEmptyExpiringInfo()
    };
  }
}

async function getExpiringStarsInfo(service, userId = null) {
  try {
    const snapshot = await getAvailableStarSnapshot(service, userId);
    return snapshot.expiringInfo;
  } catch (error) {
    logger.error('StarService', '获取即将过期星星信息失败', error);
    return buildEmptyExpiringInfo();
  }
}

function isGroupWithinReminderWindow(service, group, nowTimestamp = Date.now()) {
  const expiryTimestamp = Number(group?.expiryDate || 0);
  if (!expiryTimestamp || Number.isNaN(expiryTimestamp)) {
    return false;
  }

  const now = new Date(nowTimestamp);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const expiryDate = new Date(expiryTimestamp);
  const expiryDayStart = new Date(
    expiryDate.getFullYear(),
    expiryDate.getMonth(),
    expiryDate.getDate()
  ).getTime();
  const diffDays = Math.round((expiryDayStart - todayStart) / (24 * 60 * 60 * 1000));

  return diffDays >= 0 && diffDays < STAR_REMIND_WINDOW_DAYS;
}

async function calculatePendingExpiry(service, userId = null) {
  if (service.enableCloudStorage) {
    logger.info('StarService', '云端模式跳过本地即将过期星星计算');
    return 0;
  }
  try {
    const allGroups = await service.starGroupRepository.getAll();
    const userGroups = userId ? allGroups.filter(group => group.userId === userId) : allGroups;
    const now = Date.now();
    const pendingExpiryGroups = userGroups.filter(group =>
      group.expiryType !== StarExpiryType.PERMANENT &&
      group.expiryDate &&
      group.expiryDate > now &&
      group.expiryDate <= (now + STAR_PROTECT_WINDOW_HOURS * 60 * 60 * 1000)
    );

    const pendingPoints = pendingExpiryGroups.reduce((sum, group) => sum + (group.stars || 0), 0);
    logger.info('StarService', `计算即将过期星星数量${userId ? `, 用户=${userId}` : ''}: ${pendingPoints}颗`);
    return pendingPoints;
  } catch (error) {
    logger.error('StarService', '计算即将过期星星数量失败', error);
    return 0;
  }
}

async function protectRewardsByExpiry(service, expiredStars, userId) {
  if (service.enableCloudStorage) {
    logger.info('StarService', '云端模式跳过本地奖励过期保护');
    return { success: true, protectedCount: 0, protectedRewards: [], skipped: true };
  }

  logger.info('StarService', `🔍 保护调试开始: expiredStars=${expiredStars}, userId=${userId}`);

  if (!expiredStars || expiredStars <= 0) {
    logger.info('StarService', '无过期星星，跳过奖励保护');
    return { success: true, protectedCount: 0, protectedRewards: [] };
  }

  try {
    if (!service.rewardService) {
      logger.error('StarService', '无法获取奖励服务，跳过奖励保护');
      return { success: false, message: '奖励服务不可用' };
    }

    const totalStars = await service.getTotalStars(userId);
    logger.info('StarService', `🔍 用户当前星星状态: 当前=${totalStars}颗, 即将过期=${expiredStars}颗, 总可用=${totalStars + expiredStars}颗`);

    const availableRewards = await service.rewardService.getAvailableRewards(false, false, userId);
    logger.info('StarService', `🔍 获取到${availableRewards.length}个可用奖励`);
    availableRewards.forEach((reward, index) => {
      logger.info('StarService', `🔍 奖励${index}: "${reward.name}", ${reward.points}颗, claimed=${reward.claimed}, userId=${reward.userId}`);
    });

    const claimableRewards = availableRewards.filter(reward => {
      const totalAvailable = totalStars + expiredStars;
      const condition1 = totalAvailable >= reward.points;
      const condition2 = !reward.claimed;
      logger.info('StarService', `🔍 筛选"${reward.name}": 总额够用=${condition1}(${totalAvailable}>=${reward.points}), 未领取=${condition2}`);
      return condition1 && condition2;
    });

    logger.info('StarService', `🔍 筛选结果: ${claimableRewards.length}个可保护奖励`);
    if (claimableRewards.length === 0) {
      logger.info('StarService', `无可保护奖励：当前${totalStars}颗+即将过期${expiredStars}颗=${totalStars + expiredStars}颗总星星`);
      return { success: true, protectedCount: 0, protectedRewards: [] };
    }

    logger.info('StarService', `找到${claimableRewards.length}个可保护奖励，总可用星星：${totalStars + expiredStars}颗（当前${totalStars}+过期${expiredStars}）`);
    claimableRewards.sort((a, b) => b.points - a.points);

    let allocation = expiredStars;
    const currentStars = totalStars;
    const protectedRewards = [];

    for (const reward of claimableRewards) {
      const totalAvailable = allocation + currentStars;
      if (totalAvailable >= reward.points) {
        const partialProtection = Math.min(allocation, reward.points);
        allocation = Math.max(0, allocation - partialProtection);
        protectedRewards.push({
          ...reward,
          partialProtection
        });

        logger.info('StarService', `保护奖励: ${reward.name}(${reward.points}颗星星), 保护金额=${partialProtection}颗, 需额外支付=${reward.points - partialProtection}颗`);
      }
    }

    logger.info('StarService', `奖励保护完成，保护了${protectedRewards.length}个奖励，使用${expiredStars - allocation}颗过期星星`);
    return {
      success: true,
      protectedCount: protectedRewards.length,
      protectedRewards: protectedRewards.map(r => ({
        id: r.id,
        name: r.name,
        points: r.points,
        partialProtection: r.partialProtection || 0
      })),
      usedExpiredStars: expiredStars - allocation
    };
  } catch (error) {
    logger.error('StarService', '奖励保护失败', error);
    return { success: false, message: '保护过程中发生错误' };
  }
}

async function cleanupExpiredStars(service, userId = null) {
  if (service.enableCloudStorage) {
    logger.info('StarService', '云端模式跳过本地过期星星清理');
    return {
      success: true,
      expiredCount: 0,
      totalPoints: 0,
      skipped: true,
      message: '云端模式由后端权威处理'
    };
  }

  try {
    const expiredGroups = await service.starGroupRepository.cleanupExpiredGroups(userId);
    if (expiredGroups.length === 0) {
      logger.info('StarService', '清理过期星星: 没有发现过期星星');
      return {
        success: true,
        expiredCount: 0,
        totalPoints: 0,
        message: '没有发现过期星星'
      };
    }

    let totalExpiredPoints = 0;
    const expiredRecords = [];

    for (const group of expiredGroups) {
      if (group.stars > 0) {
        totalExpiredPoints += group.stars;
        const record = await service.starRecordRepository.createExpiredRecord(
          group.stars,
          group.expiryType,
          `星星过期: ${service._getExpiryTypeDescription(group.expiryType)}`
        );

        if (record) {
          expiredRecords.push(record);
        } else {
          logger.error('StarService', `清理过期星星: 创建记录失败, 分组ID=${group.id}, 星星数=${group.stars}`);
        }
      }
    }

    await service.starGroupRepository.cleanupEmptyGroups();
    logger.info('StarService', `清理过期星星成功, 过期分组数=${expiredGroups.length}, 过期星星总数=${totalExpiredPoints}`);

    if (totalExpiredPoints > 0) {
      service.eventBus.emit(EVENTS.STARS_EXPIRED, {
        expiredGroups,
        totalExpiredPoints,
        records: expiredRecords
      });
    }

    return {
      success: true,
      expiredCount: expiredGroups.length,
      totalPoints: totalExpiredPoints,
      records: expiredRecords,
      message: `清理了${expiredGroups.length}个过期分组，共${totalExpiredPoints}颗星星`
    };
  } catch (error) {
    logger.error('StarService', '清理过期星星失败', error);
    return { success: false, message: '清理过期星星过程中发生错误' };
  }
}

module.exports = {
  getAvailableStarSnapshot,
  getExpiringStarsInfo,
  buildAvailableStarComposition,
  isGroupWithinReminderWindow,
  calculatePendingExpiry,
  protectRewardsByExpiry,
  cleanupExpiredStars
};
