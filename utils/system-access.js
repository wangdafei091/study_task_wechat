const SYSTEM_ACCESS_LEVEL = {
  NORMAL: 'normal',
  READONLY: 'readonly',
  BLOCKED: 'blocked'
};

function getSystemAccessLevel(user = null) {
  return user?.systemAccessLevel || SYSTEM_ACCESS_LEVEL.NORMAL;
}

function isSystemReadonlyUser(user = null) {
  if (!user) {
    return false;
  }

  if (typeof user.isSystemReadonly === 'function') {
    return user.isSystemReadonly();
  }

  return getSystemAccessLevel(user) === SYSTEM_ACCESS_LEVEL.READONLY;
}

function isSystemBlockedUser(user = null) {
  if (!user) {
    return false;
  }

  if (typeof user.isSystemBlocked === 'function') {
    return user.isSystemBlocked();
  }

  return getSystemAccessLevel(user) === SYSTEM_ACCESS_LEVEL.BLOCKED;
}

module.exports = {
  SYSTEM_ACCESS_LEVEL,
  getSystemAccessLevel,
  isSystemBlockedUser,
  isSystemReadonlyUser
};
