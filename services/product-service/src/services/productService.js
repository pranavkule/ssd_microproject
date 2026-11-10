const Product = require('../models/Product');

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

function parsePrice(value, isRequired) {
  if (value === undefined && !isRequired) {
    return undefined;
  }

  if (value === undefined || value === null || value === '') {
    throw createHttpError(400, 'Price is required');
  }

  const price = Number(value);

  if (!Number.isFinite(price)) {
    throw createHttpError(400, 'Price must be a valid number');
  }

  if (price < 0) {
    throw createHttpError(400, 'Price must be greater than or equal to zero');
  }

  return price;
}

function parseStock(value, isRequired) {
  if (value === undefined && !isRequired) {
    return undefined;
  }

  if (value === undefined || value === null || value === '') {
    throw createHttpError(400, 'Stock is required');
  }

  const stock = Number(value);

  if (!Number.isInteger(stock) || stock < 0) {
    throw createHttpError(400, 'Stock must be a non-negative integer');
  }

  return stock;
}

async function listProducts(query) {
  const { page, limit, skip } = normalizePagination(query);

  const [products, total] = await Promise.all([
    Product.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
    Product.countDocuments(),
  ]);

  return {
    products,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function getProductById(id) {
  if (!isValidObjectId(id)) {
    throw createHttpError(400, 'Invalid product id');
  }

  const product = await Product.findById(id);

  if (!product) {
    throw createHttpError(404, 'Product not found');
  }

  return product;
}

async function createProduct(data = {}) {
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  const category = typeof data.category === 'string' ? data.category.trim() : '';
  const description = typeof data.description === 'string' ? data.description.trim() : '';

  if (!name) {
    throw createHttpError(400, 'Name is required');
  }

  if (!category) {
    throw createHttpError(400, 'Category is required');
  }

  const price = parsePrice(data.price, true);
  const stock = parseStock(data.stock, true);

  return Product.create({
    name,
    description,
    price,
    category,
    stock,
  });
}

async function updateProduct(id, data = {}) {
  if (!isValidObjectId(id)) {
    throw createHttpError(400, 'Invalid product id');
  }

  const product = await Product.findById(id);

  if (!product) {
    throw createHttpError(404, 'Product not found');
  }

  let hasUpdates = false;

  if (data.name !== undefined) {
    const name = typeof data.name === 'string' ? data.name.trim() : '';

    if (!name) {
      throw createHttpError(400, 'Name cannot be empty');
    }

    product.name = name;
    hasUpdates = true;
  }

  if (data.description !== undefined) {
    if (typeof data.description !== 'string') {
      throw createHttpError(400, 'Description must be a string');
    }

    product.description = data.description.trim();
    hasUpdates = true;
  }

  if (data.price !== undefined) {
    product.price = parsePrice(data.price, false);
    hasUpdates = true;
  }

  if (data.category !== undefined) {
    const category = typeof data.category === 'string' ? data.category.trim() : '';

    if (!category) {
      throw createHttpError(400, 'Category cannot be empty');
    }

    product.category = category;
    hasUpdates = true;
  }

  if (data.stock !== undefined) {
    product.stock = parseStock(data.stock, false);
    hasUpdates = true;
  }

  if (!hasUpdates) {
    throw createHttpError(400, 'No valid fields were provided for update');
  }

  await product.save();
  return product;
}

async function deleteProduct(id) {
  if (!isValidObjectId(id)) {
    throw createHttpError(400, 'Invalid product id');
  }

  const product = await Product.findByIdAndDelete(id);

  if (!product) {
    throw createHttpError(404, 'Product not found');
  }

  return product;
}

module.exports = {
  listProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
};
