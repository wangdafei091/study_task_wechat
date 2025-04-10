/**
 * feedbackUtils.js - 用户反馈工具类
 * 
 * 提供统一的用户反馈方法，如震动、声音、提示等，确保应用内的用户体验一致
 */

/**
 * 提供震动反馈
 * @param {String} type - 震动类型，可选值：'light'(轻微)、'medium'(中等)、'heavy'(强烈)
 */
const vibrateFeedback = function(type = 'light') {
  if (wx.vibrateShort) {
    wx.vibrateShort({ type: type });
  }
};

/**
 * 播放声音反馈
 * @param {String} type - 声音类型，可选值：'success'、'error'、'alert'、'click'
 */
const soundFeedback = function(type = 'click') {
  const audioContext = wx.createInnerAudioContext();
  let soundPath = '';
  
  switch(type) {
    case 'success':
      soundPath = '/assets/sounds/success.mp3';
      break;
    case 'error':
      soundPath = '/assets/sounds/error.mp3';
      break;
    case 'alert':
      soundPath = '/assets/sounds/alert.mp3';
      break;
    case 'click':
    default:
      soundPath = '/assets/sounds/click.mp3';
      break;
  }
  
  try {
    audioContext.src = soundPath;
    audioContext.play();
  } catch (e) {
    console.log('播放声音失败', e);
  }
};

/**
 * 显示统一的消息提示
 * @param {Object} options - 提示选项
 * @param {String} options.title - 提示内容
 * @param {String} options.icon - 图标，可选值：'success'、'error'、'loading'、'none'
 * @param {Number} options.duration - 显示时间(ms)
 * @param {Boolean} options.vibrate - 是否震动
 * @param {Boolean} options.sound - 是否播放声音
 */
const showToast = function(options) {
  const defaultOptions = {
    title: '',
    icon: 'none',
    duration: 1500,
    vibrate: false,
    sound: false
  };
  
  const finalOptions = { ...defaultOptions, ...options };
  
  // 显示提示
  wx.showToast({
    title: finalOptions.title,
    icon: finalOptions.icon,
    duration: finalOptions.duration
  });
  
  // 可选的震动反馈
  if (finalOptions.vibrate) {
    vibrateFeedback(finalOptions.icon === 'success' ? 'medium' : 'light');
  }
  
  // 可选的声音反馈
  if (finalOptions.sound) {
    soundFeedback(finalOptions.icon === 'success' ? 'success' : 'alert');
  }
};

/**
 * 完成任务的综合反馈
 * 包括视觉、触觉和听觉三方面的反馈
 * @param {Boolean} isComplete - 是否是完成状态(true)还是取消完成(false)
 */
const taskCompletionFeedback = function(isComplete = true) {
  if (isComplete) {
    // 完成任务的反馈
    vibrateFeedback('medium');
    // 如果有需要，这里可以添加声音反馈
  } else {
    // 取消完成的反馈
    vibrateFeedback('light');
  }
};

/**
 * 操作确认的反馈
 * 用于按钮点击等操作确认
 */
const operationFeedback = function() {
  vibrateFeedback('light');
};

module.exports = {
  vibrateFeedback,
  soundFeedback,
  showToast,
  taskCompletionFeedback,
  operationFeedback
}; 