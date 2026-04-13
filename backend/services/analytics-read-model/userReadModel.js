const {
  buildPreparedSnapshot,
  calculateAnchoredDailyBalance,
  calculateExpiryForecast,
  filterRecordsByDateRange,
  getMonthDateRange,
  sumStarGroups
} = require('./common');

function buildSnapshot({
  userId,
  monthKey,
  days,
  tasks = [],
  records = [],
  groups = [],
  nowTimestamp = Date.now()
}) {
  const dateRange = getMonthDateRange(monthKey);
  const currentBalance = sumStarGroups(groups);
  const monthRecords = dateRange
    ? filterRecordsByDateRange(records, dateRange.startDate, dateRange.endDate)
    : [];

  return buildPreparedSnapshot({
    context: {
      scope: 'user',
      userId,
      childUserIds: [],
      subjectUserIds: userId ? [userId] : []
    },
    monthKey,
    days,
    tasks,
    records: monthRecords,
    currentBalance,
    historyData: calculateAnchoredDailyBalance(records, days, currentBalance, nowTimestamp),
    forecastData: calculateExpiryForecast(currentBalance, groups, nowTimestamp),
    nowTimestamp
  });
}

module.exports = {
  buildSnapshot
};
