/**
 * 全局常量定义
 */
module.exports = {
  // 任务描述相关
  DESCRIPTION: {
    MAX_LENGTH: 20,
    PLACEHOLDER: "添加任务描述(选填)"
  },
  
  // 积分有效期常量
  POINTS_EXPIRY: {
    PERMANENT: 'permanent',
    WEEK: 'week',
    MONTH: 'month',
    THREE_MONTHS: '3months',
    SIX_MONTHS: '6months',
    TWELVE_MONTHS: '12months',
    
    // 文本映射
    TEXT: {
      'permanent': '永久',
      'week': '一周',
      'month': '一个月',
      '3months': '三个月',
      '6months': '六个月',
      '12months': '十二个月'
    }
  },
  
  // 其他全局常量可在此添加...
}; 