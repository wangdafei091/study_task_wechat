const logger = require('../../utils/logger');
const { StarExpiryType } = require('../../models/star');

function getExpiryTypeDescription(service, expiryType) {
  switch (expiryType) {
    case StarExpiryType.PERMANENT:
      return '永久有效';
    case StarExpiryType.WEEK:
      return '本周结束';
    case StarExpiryType.MONTH:
      return '本月结束';
    case StarExpiryType.QUARTER:
      return '本季度结束';
    default:
      return expiryType;
  }
}

function calculateExpiryDate(service, expiryType) {
  logger.info('StarService', `计算积分有效期: 类型=${expiryType}`);

  if (expiryType === 'permanent') {
    logger.info('StarService', '积分永久有效');
    return {
      expiry: 'permanent',
      expiryDateStr: '永久'
    };
  }

  const expiryDate = service._calculateExpiryDate(expiryType);
  if (!expiryDate) {
    logger.warn('StarService', `无法计算有效期: ${expiryType}`);
    return {
      expiry: 'permanent',
      expiryDateStr: '永久'
    };
  }

  const dateStr = service._formatExpiryDate(expiryDate);
  logger.info('StarService', `计算结果: ${dateStr}`);
  return {
    expiry: expiryDate.getTime(),
    expiryDateStr: dateStr
  };
}

function getExpiryText(service, expiryType) {
  const Constants = require('../../utils/constants');

  if (Constants.POINTS_EXPIRY.TEXT[expiryType]) {
    return Constants.POINTS_EXPIRY.TEXT[expiryType];
  }

  switch (expiryType) {
    case 'permanent':
      return '永久';
    case 'week':
      return '本周结束';
    case 'month':
      return '本月结束';
    case 'quarter':
      return '本季度结束';
    default:
      return '永久';
  }
}

function formatExpiryDate(service, expiryDate) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const expiry = new Date(expiryDate.getFullYear(), expiryDate.getMonth(), expiryDate.getDate());

  const diffTime = expiry.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  let result;
  if (diffDays === 0) {
    result = '今天到期';
  } else if (diffDays === 1) {
    result = '明天到期';
  } else {
    const year = expiryDate.getFullYear();
    const month = String(expiryDate.getMonth() + 1).padStart(2, '0');
    const day = String(expiryDate.getDate()).padStart(2, '0');
    result = `${year}-${month}-${day} 到期`;
  }

  logger.info('StarService', `过期日期格式化: ${expiryDate.toISOString()} -> ${result}`);
  return result;
}

function buildEndOfDayDate(service, year, monthIndex, day) {
  return new Date(year, monthIndex, day, 23, 59, 59, 999);
}

function parseExpiryDateValue(service, expiryValue) {
  if (expiryValue === null || expiryValue === undefined || expiryValue === '') {
    return null;
  }

  if (expiryValue instanceof Date) {
    return Number.isNaN(expiryValue.getTime()) ? null : new Date(expiryValue.getTime());
  }

  if (typeof expiryValue === 'number') {
    if (!Number.isFinite(expiryValue)) {
      return null;
    }
    const parsedFromNumber = new Date(expiryValue);
    return Number.isNaN(parsedFromNumber.getTime()) ? null : parsedFromNumber;
  }

  if (typeof expiryValue !== 'string') {
    return null;
  }

  const trimmed = expiryValue.trim();
  if (!trimmed || trimmed === '永久') {
    return null;
  }

  if (trimmed === '今天到期' || trimmed === '今天') {
    const today = new Date();
    return service._buildEndOfDayDate(today.getFullYear(), today.getMonth(), today.getDate());
  }

  if (trimmed === '明天到期' || trimmed === '明天') {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return service._buildEndOfDayDate(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
  }

  const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s*到期)?$/);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const monthIndex = Number(dateOnlyMatch[2]) - 1;
    const day = Number(dateOnlyMatch[3]);
    const parsedDate = service._buildEndOfDayDate(year, monthIndex, day);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeExpiryDateValue(service, expiryValue) {
  const parsedDate = service._parseExpiryDateValue(expiryValue);
  if (!parsedDate) {
    return null;
  }

  const year = parsedDate.getFullYear();
  const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
  const day = String(parsedDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function resolveExpiryMetadata(service, expiryValue, fallbackDisplayText = '') {
  const parsedDate = service._parseExpiryDateValue(expiryValue);
  if (!parsedDate) {
    return {
      normalizedDate: null,
      timestamp: null,
      displayText: fallbackDisplayText || ''
    };
  }

  return {
    normalizedDate: service._normalizeExpiryDateValue(parsedDate),
    timestamp: parsedDate.getTime(),
    displayText: service._formatExpiryDate(parsedDate)
  };
}

function calculateExpiryDateInternal(service, expiryType) {
  if (expiryType === StarExpiryType.PERMANENT) {
    return null;
  }

  const now = new Date();
  const result = new Date(now);

  switch (expiryType) {
    case StarExpiryType.WEEK: {
      const daysUntilSunday = 7 - now.getDay();
      result.setDate(now.getDate() + (daysUntilSunday === 7 ? 0 : daysUntilSunday));
      result.setHours(23, 59, 59, 999);
      break;
    }
    case StarExpiryType.MONTH: {
      result.setMonth(result.getMonth() + 1, 0);
      result.setHours(23, 59, 59, 999);
      break;
    }
    case StarExpiryType.QUARTER: {
      const currentMonth = now.getMonth();
      const quarterEndMonth = Math.floor(currentMonth / 3) * 3 + 2;
      result.setMonth(quarterEndMonth + 1, 0);
      result.setHours(23, 59, 59, 999);
      break;
    }
    default:
      return null;
  }

  return result;
}

function formatStarCount(service, points, useThousandSeparator = false) {
  const numPoints = parseInt(points, 10) || 0;

  if (useThousandSeparator) {
    return numPoints.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  return numPoints.toString();
}

module.exports = {
  getExpiryTypeDescription,
  calculateExpiryDate,
  getExpiryText,
  formatExpiryDate,
  buildEndOfDayDate,
  parseExpiryDateValue,
  normalizeExpiryDateValue,
  resolveExpiryMetadata,
  calculateExpiryDateInternal,
  formatStarCount
};
