const logger = require('../../utils/logger');

function logUIOptimization(component, action, details = {}) {
  logger.info('uiUtils', `界面优化: ${component} - ${action}`, details);
}

function logStyleConsistency(area, changes = {}) {
  logger.info('uiUtils', `样式一致性: ${area}`, changes);
}

function logButtonLayoutOptimization(page, layoutInfo = {}) {
  logger.info('uiUtils', `按钮布局优化: ${page}`, layoutInfo);
}

function getPressureLevelText(pressure) {
  let levelText = '轻松';
  let levelNum = 1;
  let isHigh = false;

  logger.info('uiUtils', `计算压力级别，当前压力值：${pressure}（小学低年级标准）`);

  if (pressure <= 15) {
    levelText = '轻松';
    levelNum = 1;
  } else if (pressure <= 30) {
    levelText = '适中';
    levelNum = 2;
  } else if (pressure <= 45) {
    levelText = '繁忙';
    levelNum = 3;
    isHigh = true;
  } else {
    levelText = '紧张';
    levelNum = 4;
    isHigh = true;
  }

  return { levelText, levelNum, isHigh };
}

module.exports = {
  logUIOptimization,
  logStyleConsistency,
  logButtonLayoutOptimization,
  getPressureLevelText
};
