const userService = require('./userService');
const systemSettingService = require('./systemSettingService');
const inviteCodeService = require('./inviteCodeService');

class SystemAdminService {
  async getBootstrapContext(userId) {
    const user = await userService.findById(userId);
    return {
      canEnterSystemAdmin: Boolean(
        user &&
        user.status === 'active' &&
        user.role === 'parent' &&
        user.isSystemAdmin === true
      )
    };
  }

  async getOverview() {
    const summary = await systemSettingService.getAppAccessMode();
    const inviteGovernance = await inviteCodeService.getAdmissionGovernanceOverview();
    return {
      appAccessMode: summary.mode,
      modeSource: summary.source,
      updatedAt: summary.updatedAt,
      updatedByUserId: summary.updatedByUserId,
      admissionInviteGovernance: inviteGovernance
    };
  }
}

module.exports = new SystemAdminService();
