const familyService = require('../services/familyService');

/**
 * 解析目标用户 ID。
 * - 未传时返回登录用户自身
 * - 家长可代理同家庭孩子
 * - 其他情况返回 null
 */
async function resolveTargetUserId(req, targetUserId) {
  const { userId, role, familyId } = req.user;

  if (!targetUserId || targetUserId === userId) {
    return userId;
  }

  if (role !== 'parent' || !familyId) {
    return null;
  }

  const targetInfo = await familyService.getUserFamilyAndRole(targetUserId);
  if (!targetInfo || targetInfo.familyId !== familyId || targetInfo.role !== 'child') {
    return null;
  }

  return targetUserId;
}

module.exports = {
  resolveTargetUserId,
};
