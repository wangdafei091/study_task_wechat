const dateUtils = require('../../../../utils/dateUtils');
const logger = require('../../../../utils/logger');

function getTemplateDisplayName(template) {
  if (!template) {
    return '';
  }

  const alias = String(template.name || '').trim();
  const taskTitle = String(template.taskPayload?.title || '').trim();

  if (alias && alias !== taskTitle) {
    return alias;
  }

  return taskTitle || alias;
}

async function loadRecentTemplates(page, taskTemplateService, limit = 5) {
  if (!page || !taskTemplateService) {
    return [];
  }

  if (page.data?.templateEntryLoadedOnce !== true) {
    page.setData({
      templateEntryLoading: true
    });
  }

  try {
    const result = await taskTemplateService.getRecentTemplates(limit);
    const templates = Array.isArray(result?.templates)
      ? result.templates.map((template) => ({
        ...template,
        displayName: getTemplateDisplayName(template)
      }))
      : [];
    const selectedTemplateId = page.data?.selectedTemplateId || null;
    const hasSelectedTemplate = selectedTemplateId
      ? templates.some((template) => template.id === selectedTemplateId)
      : false;

    page.setData({
      recentTemplates: templates,
      hasTemplates: templates.length > 0,
      selectedTemplateId: hasSelectedTemplate ? selectedTemplateId : null,
      templateEntryLoading: false,
      templateEntryLoadedOnce: true
    });

    return templates;
  } catch (error) {
    logger.warn('TaskTemplateEntry', '加载最近模板失败，继续使用当前页面状态', error);
    page.setData({
      recentTemplates: [],
      hasTemplates: false,
      templateEntryLoading: false,
      templateEntryLoadedOnce: true
    });
    return [];
  }
}

function applyTemplateToTaskEditForm(page, taskTemplateService, template) {
  if (!page || !taskTemplateService || !template) {
    return null;
  }

  const result = taskTemplateService.applyTemplateToTaskForm(template, {
    today: dateUtils.getTodayString()
  });

  if (result?.formPatch) {
    page.setData({
      ...result.formPatch,
      'errors.title': ''
    });
  }

  return result;
}

function resetSelectedTemplate(page) {
  if (!page) {
    return;
  }

  page.setData({
    selectedTemplateId: null
  });
}

module.exports = {
  loadRecentTemplates,
  applyTemplateToTaskEditForm,
  resetSelectedTemplate,
  getTemplateDisplayName
};
