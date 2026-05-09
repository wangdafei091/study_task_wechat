const TokenManager = require('../token-manager');

function hasAuthenticatedToken() {
  return Boolean(TokenManager.getToken() && TokenManager.isAuthenticated());
}

function hasAuthenticatedSession(userService) {
  return Boolean(userService?.getLoginUser?.()) || hasAuthenticatedToken();
}

module.exports = {
  hasAuthenticatedToken,
  hasAuthenticatedSession
};
