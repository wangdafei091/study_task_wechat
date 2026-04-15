const logger = require('../../utils/logger');
const dateUtils = require('../../utils/dateUtils');
const { TaskStatus } = require('../../models/task');

const TYPE_ORDER = {
  study: 0,
  habit: 1,
  interest: 2,
  mixed: 3
};

const STATE_PRIORITY = {
  blank: 0,
  upcoming: 1,
  done: 2,
  missed: 3
};

const MAX_DISPLAY_ROWS = 12;

function normalizeMonthKey(monthKey) {
  if (typeof monthKey !== 'string' || !/^\d{4}-\d{2}$/.test(monthKey)) {
    return dateUtils.getTodayString().slice(0, 7);
  }

  return monthKey;
}

function buildMonthContext(monthKey) {
  const normalizedMonthKey = normalizeMonthKey(monthKey);
  const parts = normalizedMonthKey.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const daysInMonth = lastDay.getDate();
  const todayString = dateUtils.getTodayString();
  const monthTitle = `${year}年${month}月`;

  return {
    monthKey: normalizedMonthKey,
    monthTitle,
    year,
    month,
    daysInMonth,
    firstDay,
    lastDay,
    startDate: dateUtils.formatDate(firstDay),
    endDate: dateUtils.formatDate(lastDay),
    todayString,
    currentMonthKey: todayString.slice(0, 7)
  };
}

function normalizeTitle(title) {
  return String(title || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/（/g, '(')
    .replace(/）/g, ')');
}

function resolveTitle(task) {
  const normalized = normalizeTitle(task && task.title);
  return normalized || '未命名任务';
}

function getTaskType(task) {
  const type = task && task.type;
  return Object.prototype.hasOwnProperty.call(TYPE_ORDER, type) ? type : 'mixed';
}

function getDateIndex(dateString, monthContext) {
  if (typeof dateString !== 'string' || dateString.indexOf(monthContext.monthKey) !== 0) {
    return -1;
  }

  const day = Number(dateString.slice(-2));
  if (!Number.isInteger(day) || day < 1 || day > monthContext.daysInMonth) {
    return -1;
  }

  return day - 1;
}

function getWeekdayLabel(dateString) {
  const target = new Date(dateString);
  const labels = ['日', '一', '二', '三', '四', '五', '六'];
  return labels[target.getDay()] || '';
}

function createColumns(monthContext) {
  const columns = [];

  for (let day = 1; day <= monthContext.daysInMonth; day += 1) {
    const date = new Date(monthContext.year, monthContext.month - 1, day);
    const dateString = dateUtils.formatDate(date);
    columns.push({
      key: dateString,
      day,
      date: dateString,
      weekdayLabel: getWeekdayLabel(dateString),
      isToday: dateString === monthContext.todayString,
      isWeekend: date.getDay() === 0 || date.getDay() === 6
    });
  }

  return columns;
}

function applyColumnMetadata(columns, tasks, monthContext) {
  const plannedDates = new Set(
    (Array.isArray(tasks) ? tasks : [])
      .map((task) => task && task.date)
      .filter((date) => typeof date === 'string' && getDateIndex(date, monthContext) >= 0)
  );

  return columns.map((column) => ({
    ...column,
    hasPlannedTasks: plannedDates.has(column.date),
    isFutureEmpty: column.date > monthContext.todayString && !plannedDates.has(column.date)
  }));
}

function decorateCell(cell) {
  const state = cell.state || 'blank';
  const symbolMap = {
    blank: '',
    done: '✓',
    missed: '✕',
    upcoming: '○'
  };

  return {
    date: cell.date,
    state,
    symbol: symbolMap[state] || '',
    cellClass: `cell-${state}`,
    taskIds: Array.isArray(cell.taskIds) ? cell.taskIds : [],
    isToday: cell.isToday === true,
    isWeekend: cell.isWeekend === true,
    isFutureEmpty: cell.isFutureEmpty === true
  };
}

function createBlankCell(column) {
  return decorateCell({
    date: column.date,
    state: 'blank',
    taskIds: [],
    isToday: column.isToday,
    isWeekend: column.isWeekend,
    isFutureEmpty: column.isFutureEmpty
  });
}

function resolveTaskState(task, monthContext) {
  if (Number(task && task.status) === TaskStatus.COMPLETED) {
    return 'done';
  }

  if (typeof (task && task.date) === 'string' && task.date === monthContext.todayString) {
    return 'upcoming';
  }

  if (typeof (task && task.date) === 'string' && task.date > monthContext.todayString) {
    return 'upcoming';
  }

  return 'missed';
}

function mergeCellState(currentState, nextState) {
  return STATE_PRIORITY[nextState] > STATE_PRIORITY[currentState]
    ? nextState
    : currentState;
}

function buildRow(columns, task, focusUserId) {
  const title = resolveTitle(task);
  const type = getTaskType(task);

  return {
    rowKey: `${focusUserId || 'unknown'}|${type}|${normalizeTitle(title)}`,
    title,
    type,
    firstActiveIndex: Number.MAX_SAFE_INTEGER,
    plannedCellCount: 0,
    cells: columns.map(createBlankCell)
  };
}

function sortRows(rows) {
  return rows.sort((left, right) => {
    const leftTypeOrder = TYPE_ORDER[left.type] !== undefined ? TYPE_ORDER[left.type] : 99;
    const rightTypeOrder = TYPE_ORDER[right.type] !== undefined ? TYPE_ORDER[right.type] : 99;
    if (leftTypeOrder !== rightTypeOrder) {
      return leftTypeOrder - rightTypeOrder;
    }

    if (left.firstActiveIndex !== right.firstActiveIndex) {
      return left.firstActiveIndex - right.firstActiveIndex;
    }

    if (left.plannedCellCount !== right.plannedCellCount) {
      return right.plannedCellCount - left.plannedCellCount;
    }

    return left.title.localeCompare(right.title, 'zh-Hans-CN');
  });
}

function mergeOverflowRows(rows, columns) {
  if (rows.length <= MAX_DISPLAY_ROWS) {
    return rows;
  }

  const keptRows = rows.slice(0, MAX_DISPLAY_ROWS - 1);
  const overflowRows = rows.slice(MAX_DISPLAY_ROWS - 1);
  const firstOverflowRow = overflowRows[0] || null;
  const otherRow = {
    rowKey: '__other__',
    title: '其他任务',
    type: 'mixed',
    firstActiveIndex: firstOverflowRow ? firstOverflowRow.firstActiveIndex : Number.MAX_SAFE_INTEGER,
    plannedCellCount: 0,
    cells: columns.map(createBlankCell)
  };

  overflowRows.forEach((row) => {
    row.cells.forEach((cell, index) => {
      if (cell.state === 'blank') {
        return;
      }

      const currentCell = otherRow.cells[index];
      const mergedState = mergeCellState(currentCell.state, cell.state);
      otherRow.cells[index] = decorateCell({
        date: currentCell.date,
        state: mergedState,
        taskIds: currentCell.taskIds.concat(cell.taskIds || []),
        isToday: currentCell.isToday,
        isWeekend: currentCell.isWeekend,
        isFutureEmpty: false
      });
    });
  });

  otherRow.plannedCellCount = otherRow.cells.filter((cell) => cell.state !== 'blank').length;
  return keptRows.concat(otherRow);
}

function summarizeRows(rows) {
  return rows.reduce((summary, row) => {
    row.cells.forEach((cell) => {
      if (cell.state === 'done') {
        summary.completedCount += 1;
      } else if (cell.state === 'missed') {
        summary.missedCount += 1;
      } else if (cell.state === 'upcoming') {
        summary.upcomingCount += 1;
      }
    });

    return summary;
  }, {
    displayedRowCount: rows.length,
    completedCount: 0,
    missedCount: 0,
    upcomingCount: 0
  });
}

function normalizeTask(task) {
  return {
    id: task && task.id ? task.id : '',
    userId: task && task.userId ? task.userId : '',
    title: resolveTitle(task),
    type: getTaskType(task),
    date: task && task.date ? task.date : '',
    status: Number(task && task.status !== undefined ? task.status : TaskStatus.PENDING)
  };
}

async function buildMonthlyBoard(options) {
  const taskService = options && options.taskService;
  const monthKey = options && options.monthKey;
  const focusUserId = options && options.focusUserId;

  if (!taskService || typeof taskService.getTasksByDateRange !== 'function') {
    throw new Error('taskService 缺少 getTasksByDateRange 能力');
  }

  const monthContext = buildMonthContext(monthKey);
  const baseColumns = createColumns(monthContext);

  if (!focusUserId) {
    const columns = applyColumnMetadata(baseColumns, [], monthContext);
    return {
      monthKey: monthContext.monthKey,
      monthTitle: monthContext.monthTitle,
      daysInMonth: monthContext.daysInMonth,
      columns,
      rows: [],
      summary: {
        displayedRowCount: 0,
        completedCount: 0,
        missedCount: 0,
        upcomingCount: 0
      },
      todayColumnDate: monthContext.currentMonthKey === monthContext.monthKey
        ? monthContext.todayString
        : ''
    };
  }

  const tasks = await taskService.getTasksByDateRange(
    monthContext.startDate,
    monthContext.endDate,
    focusUserId,
    { requireFreshStars: true }
  );
  const columns = applyColumnMetadata(baseColumns, tasks, monthContext);

  const rowMap = new Map();

  (Array.isArray(tasks) ? tasks : [])
    .map(normalizeTask)
    .filter((task) => task.date && getDateIndex(task.date, monthContext) >= 0)
    .forEach((task) => {
      const rowKey = `${focusUserId}|${task.type}|${normalizeTitle(task.title)}`;
      if (!rowMap.has(rowKey)) {
        rowMap.set(rowKey, buildRow(columns, task, focusUserId));
      }

      const row = rowMap.get(rowKey);
      const cellIndex = getDateIndex(task.date, monthContext);
      const nextState = resolveTaskState(task, monthContext);
      const currentCell = row.cells[cellIndex];

      row.cells[cellIndex] = decorateCell({
        date: currentCell.date,
        state: mergeCellState(currentCell.state, nextState),
        taskIds: currentCell.taskIds.concat(task.id ? [task.id] : []),
        isToday: currentCell.isToday,
        isWeekend: currentCell.isWeekend,
        isFutureEmpty: false
      });

      row.firstActiveIndex = Math.min(row.firstActiveIndex, cellIndex);
      row.plannedCellCount = row.cells.filter((cell) => cell.state !== 'blank').length;
    });

  const sortedRows = sortRows(Array.from(rowMap.values()));
  const displayedRows = mergeOverflowRows(sortedRows, columns);
  const summary = summarizeRows(displayedRows);

  logger.info('analysis-board-service', '生成月度看板成功', {
    monthKey: monthContext.monthKey,
    focusUserId,
    taskCount: Array.isArray(tasks) ? tasks.length : 0,
    rowCount: displayedRows.length
  });

  return {
    monthKey: monthContext.monthKey,
    monthTitle: monthContext.monthTitle,
    daysInMonth: monthContext.daysInMonth,
    columns,
    rows: displayedRows,
    summary,
    todayColumnDate: monthContext.currentMonthKey === monthContext.monthKey
      ? monthContext.todayString
      : ''
  };
}

module.exports = {
  buildMonthlyBoard,
  __testables: {
    MAX_DISPLAY_ROWS,
    normalizeMonthKey,
    buildMonthContext,
    normalizeTitle,
    resolveTaskState,
    mergeOverflowRows
  }
};
