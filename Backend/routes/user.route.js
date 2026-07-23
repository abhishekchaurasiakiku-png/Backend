const {
  deleteUser,
  getUser,
  getUsers,
  login,
  signup,
  updateUser,
} = require("../controllers/user.controller");

const normalizePath = (url) =>
  url.length > 1 ? url.replace(/\/+$/, "") : url;

const matchUserIdRoute = (url) => {
  const match = normalizePath(url).match(/^\/api\/users?\/([^/]+)$/);
  return match ? match[1] : null;
};

const runRoute = async (req, res, handler, params = {}) => {
  req.params = params;
  await handler(req, res);
  return true;
};

const handleUserRoutes = async (req, res) => {
  const url = normalizePath(req.url);

  if (req.method === "GET" && ["/api/users", "/api/user"].includes(url)) {
    return runRoute(req, res, getUsers);
  }

  if (
    req.method === "POST" &&
    [
      "/api/user",
      "/api/users",
      "/api/user/signup",
      "/api/users/signup",
      "/api/user/register",
      "/api/users/register",
    ].includes(url)
  ) {
    return runRoute(req, res, signup);
  }

  if (
    req.method === "POST" &&
    [
      "/api/user/login",
      "/api/users/login",
      "/api/user/signin",
      "/api/users/signin",
    ].includes(url)
  ) {
    return runRoute(req, res, login);
  }

  const userId = matchUserIdRoute(url);

  if (!userId) {
    return false;
  }

  if (req.method === "GET") {
    return runRoute(req, res, getUser, { id: userId });
  }

  if (["PUT", "PATCH"].includes(req.method)) {
    return runRoute(req, res, updateUser, { id: userId });
  }

  if (req.method === "DELETE") {
    return runRoute(req, res, deleteUser, { id: userId });
  }

  return false;
};

module.exports = handleUserRoutes;
