const crypto = require("crypto");
const { ObjectId } = require("mongodb");
const { getUsersCollection } = require("../models/user.model");

const normalizeString = (value) =>
  typeof value === "string" ? value.trim() : "";

const sanitizeEmail = (email) => normalizeString(email).toLowerCase();

const isDuplicateKeyError = (error) => error && error.code === 11000;

const createPasswordHash = (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
};

const verifyPassword = (password, storedPassword) => {
  if (!storedPassword) {
    return false;
  }

  const [salt, storedHash] = storedPassword.split(":");
  if (!salt || !storedHash) {
    return false;
  }

  const hashBuffer = crypto.scryptSync(password, salt, 64);
  const storedBuffer = Buffer.from(storedHash, "hex");

  if (hashBuffer.length !== storedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(hashBuffer, storedBuffer);
};

const base64Url = (payload) =>
  Buffer.from(payload).toString("base64url");

const createToken = (user) => {
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64Url(
    JSON.stringify({
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      iat: Math.floor(Date.now() / 1000),
    }),
  );
  const secret = process.env.JWT_SECRET || "tourism-app-secret";
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");

  return `${header}.${body}.${signature}`;
};

const publicUser = (user) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
});

const findUserById = async (id) => {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  return getUsersCollection().findOne({ _id: new ObjectId(id) });
};

const signup = async (req, res) => {
  const { name, email, password } = req.body || {};
  const normalizedName = normalizeString(name);
  const normalizedEmail = sanitizeEmail(email);

  if (!normalizedName || !normalizedEmail || !normalizeString(password)) {
    return res.status(400).json({
      success: false,
      message: "Name, email and password are required.",
    });
  }

  const users = getUsersCollection();
  const existingUser = await users.findOne({ email: normalizedEmail });

  if (existingUser) {
    return res.status(409).json({
      success: false,
      message: "Account already exists. Please login.",
    });
  }

  const now = new Date();
  let result;

  try {
    result = await users.insertOne({
      name: normalizedName,
      email: normalizedEmail,
      password: createPasswordHash(password),
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
      loginCount: 1,
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return res.status(409).json({
        success: false,
        message: "Account already exists. Please login.",
      });
    }

    throw error;
  }

  const user = await users.findOne({ _id: result.insertedId });

  return res.status(201).json({
    success: true,
    message: "Signup successful.",
    token: createToken(user),
    user: publicUser(user),
  });
};

const login = async (req, res) => {
  const { email, password } = req.body || {};
  const normalizedEmail = sanitizeEmail(email);

  if (!normalizedEmail || !normalizeString(password)) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required.",
    });
  }

  const users = getUsersCollection();
  const user = await users.findOne({ email: normalizedEmail });

  if (!user || !verifyPassword(password, user.password)) {
    return res.status(401).json({
      success: false,
      message: "Invalid email or password.",
    });
  }

  const now = new Date();
  await users.updateOne(
    { _id: user._id },
    {
      $set: {
        lastLoginAt: now,
        updatedAt: now,
      },
      $inc: {
        loginCount: 1,
      },
    },
  );

  const updatedUser = await users.findOne({ _id: user._id });

  return res.status(200).json({
    success: true,
    message: `Welcome back, ${updatedUser.name}`,
    token: createToken(updatedUser),
    user: publicUser(updatedUser),
  });
};

const getUsers = async (_req, res) => {
  const users = await getUsersCollection()
    .find({}, { projection: { password: 0 } })
    .sort({ createdAt: -1 })
    .toArray();

  return res.status(200).json({
    success: true,
    data: users.map((user) => publicUser(user)),
  });
};

const getUser = async (req, res) => {
  const user = await findUserById(req.params.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found.",
    });
  }

  return res.status(200).json({
    success: true,
    user: publicUser(user),
  });
};

const updateUser = async (req, res) => {
  const { name, email, password } = req.body || {};
  const users = getUsersCollection();
  const user = await findUserById(req.params.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found.",
    });
  }

  const updates = {
    updatedAt: new Date(),
  };

  if (typeof name === "string" && name.trim()) {
    updates.name = name.trim();
  }

  if (typeof email === "string" && email.trim()) {
    const normalizedEmail = sanitizeEmail(email);
    const existingUser = await users.findOne({ email: normalizedEmail });

    if (
      existingUser &&
      existingUser._id.toString() !== user._id.toString()
    ) {
      return res.status(409).json({
        success: false,
        message: "Email already exists.",
      });
    }

    updates.email = normalizedEmail;
  }

  if (typeof password === "string" && password.trim()) {
    updates.password = createPasswordHash(password);
  }

  if (Object.keys(updates).length === 1) {
    return res.status(400).json({
      success: false,
      message: "Name, email or password is required.",
    });
  }

  await users.updateOne(
    { _id: user._id },
    {
      $set: updates,
    },
  );

  const updatedUser = await users.findOne({ _id: user._id });

  return res.status(200).json({
    success: true,
    message: "User updated successfully.",
    user: publicUser(updatedUser),
  });
};

const deleteUser = async (req, res) => {
  const user = await findUserById(req.params.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found.",
    });
  }

  await getUsersCollection().deleteOne({ _id: user._id });

  return res.status(200).json({
    success: true,
    message: "User deleted successfully.",
  });
};

module.exports = {
  deleteUser,
  getUser,
  getUsers,
  login,
  signup,
  updateUser,
};
