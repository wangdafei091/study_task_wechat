const familyService = require('../services/familyService');
const { error } = require('./response');

async function ensureManagerBusinessAccess(req, res, options = {}) {
  const deniedMessage = options.deniedMessage || '当前为查看者，不能修改内容';

  if (req.user.role !== 'parent' || !req.user.familyId) {
    return true;
  }

  const operator = await familyService.getUserFamilyRoleProfile(req.user.userId);
  if (!operator || operator.role !== 'parent' || operator.familyId !== req.user.familyId) {
    res.status(403).json(error('无权限操作', 'PERMISSION_DENIED'));
    return false;
  }

  if (operator.familyPermissionRole !== 'manager') {
    res.status(403).json(error(deniedMessage, 'FAMILY_MANAGER_REQUIRED'));
    return false;
  }

  return true;
}

async function ensureParentManagerBusinessAccess(req, res, options = {}) {
  const parentRequiredMessage = options.parentRequiredMessage || '仅家长可操作';

  if (req.user.role !== 'parent') {
    res.status(403).json(error(parentRequiredMessage, 'PERMISSION_DENIED'));
    return false;
  }

  return ensureManagerBusinessAccess(req, res, options);
}

async function isViewerChildExecutionRequest(req, subjectUserId) {
  if (!subjectUserId || req.user.role !== 'parent' || !req.user.familyId) {
    return false;
  }

  const requestedActorUserId = req.body?.operatorContext?.actorUserId || null;
  if (!requestedActorUserId || requestedActorUserId !== subjectUserId) {
    return false;
  }

  const operator = await familyService.getUserFamilyRoleProfile(req.user.userId);
  if (!operator || operator.role !== 'parent' || operator.familyId !== req.user.familyId) {
    return false;
  }

  if (operator.familyPermissionRole !== 'viewer') {
    return false;
  }

  const subjectInfo = await familyService.getUserFamilyAndRole(subjectUserId);
  return Boolean(
    subjectInfo &&
    subjectInfo.familyId === req.user.familyId &&
    subjectInfo.role === 'child'
  );
}

module.exports = {
  ensureManagerBusinessAccess,
  ensureParentManagerBusinessAccess,
  isViewerChildExecutionRequest
};
