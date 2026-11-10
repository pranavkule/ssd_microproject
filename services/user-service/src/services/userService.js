const User = require('../models/User');

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function isValidObjectId(value) {
  return typeof value === 'string' && OBJECT_ID_PATTERN.test(value);
}

function normalizePagination(query = {}) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 10 : Number(query.limit);

  if (!Number.isInteger(page) || page < 1) {
    throw createHttpError(400, 'Page must be a positive integer');
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw createHttpError(400, 'Limit must be an integer between 1 and 100');
  }

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

async function listUsers(query) {
  const { page, limit, skip } = normalizePagination(query);

  const [users, total] = await Promise.all([
    User.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(),
  ]);

  return {
    users,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function getUserById(id) {
  if (!isValidObjectId(id)) {
    throw createHttpError(400, 'Invalid user id');
  }

  const user = await User.findById(id);

  if (!user) {
    throw createHttpError(404, 'User not found');
  }

  return user;
}

async function createUser(data = {}) {
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';

  if (!name) {
    throw createHttpError(400, 'Name is required');
  }

  if (!email) {
    throw createHttpError(400, 'Email is required');
  }

  const existingUser = await User.findOne({ email });

  if (existingUser) {
    throw createHttpError(409, 'A user with this email already exists');
  }

  return User.create({
    name,
    email,
    role: data.role || 'user',
  });
}

async function updateUser(id, data = {}) {
  if (!isValidObjectId(id)) {
    throw createHttpError(400, 'Invalid user id');
  }

  const user = await User.findById(id);

  if (!user) {
    throw createHttpError(404, 'User not found');
  }

  let hasUpdates = false;

  if (data.name !== undefined) {
    const name = typeof data.name === 'string' ? data.name.trim() : '';

    if (!name) {
      throw createHttpError(400, 'Name cannot be empty');
    }

    user.name = name;
    hasUpdates = true;
  }

  if (data.email !== undefined) {
    const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';

    if (!email) {
      throw createHttpError(400, 'Email cannot be empty');
    }

    const existingUser = await User.findOne({ email, _id: { $ne: id } });

    if (existingUser) {
      throw createHttpError(409, 'A user with this email already exists');
    }

    user.email = email;
    hasUpdates = true;
  }

  if (data.role !== undefined) {
    if (!['user', 'admin'].includes(data.role)) {
      throw createHttpError(400, 'Role must be either user or admin');
    }

    user.role = data.role;
    hasUpdates = true;
  }

  if (!hasUpdates) {
    throw createHttpError(400, 'No valid fields were provided for update');
  }

  await user.save();
  return user;
}

async function deleteUser(id) {
  if (!isValidObjectId(id)) {
    throw createHttpError(400, 'Invalid user id');
  }

  const user = await User.findByIdAndDelete(id);

  if (!user) {
    throw createHttpError(404, 'User not found');
  }

  return user;
}

module.exports = {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
};
