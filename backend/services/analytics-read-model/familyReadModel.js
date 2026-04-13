const {
  buildPreparedSnapshot,
  calculateAnchoredDailyBalance,
  calculateExpiryForecast,
  filterRecordsByDateRange,
  getMonthDateRange,
  groupFamilySummaryByUser,
  sumStarGroups
} = require('./common');

function buildSnapshot({
  subjectUserIds = [],
  monthKey,
  days,
  tasks = [],
  records = [],
  groups = [],
  nowTimestamp = Date.now()
}) {
  if (!Array.isArray(subjectUserIds) || subjectUserIds.length === 0) {
    return buildPreparedSnapshot({
      context: {
        scope: 'family',
        userId: null,
        childUserIds: [],
        subjectUserIds: []
      },
      monthKey,
      days,
      tasks: [],
      records: [],
      currentBalance: 0,
      familyGroupSnapshots: {},
      historyData: [],
      forecastData: [],
      nowTimestamp
    });
  }

  const dateRange = getMonthDateRange(monthKey);
  const currentBalance = sumStarGroups(groups);
  const monthRecords = dateRange
    ? filterRecordsByDateRange(records, dateRange.startDate, dateRange.endDate)
    : [];

  return buildPreparedSnapshot({
    context: {
      scope: 'family',
      userId: null,
      childUserIds: subjectUserIds,
      subjectUserIds
    },
    monthKey,
    days,
    tasks,
    records: monthRecords,
    currentBalance,
    familyGroupSnapshots: groupFamilySummaryByUser(groups),
    historyData: calculateAnchoredDailyBalance(records, days, currentBalance, nowTimestamp),
    forecastData: calculateExpiryForecast(currentBalance, groups, nowTimestamp),
    nowTimestamp
  });
}

module.exports = {
  buildSnapshot
};
