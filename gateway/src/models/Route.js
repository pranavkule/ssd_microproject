const mongoose = require('mongoose');
const {
  LOAD_BALANCING_STRATEGIES,
  SUPPORTED_HTTP_METHODS,
  normalizePath,
  normalizeTarget,
} = require('../utils/routeValidation');

const backendInstanceSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    target: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (value) => {
          try {
            normalizeTarget(value);
            return true;
          } catch (error) {
            return false;
          }
        },
        message: 'Backend target must be a valid HTTP or HTTPS URL',
      },
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    weight: {
      type: Number,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: 'Backend weight must be a positive integer',
      },
    },
    healthCheckPath: {
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

const routeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Route name is required'],
      trim: true,
      maxlength: [100, 'Route name cannot exceed 100 characters'],
      unique: true,
    },
    path: {
      type: String,
      required: [true, 'Route path is required'],
      trim: true,
      unique: true,
      set: (value) => {
        if (typeof value !== 'string') {
          return value;
        }

        return value.trim().replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
      },
      validate: {
        validator: (value) => {
          try {
            return normalizePath(value) === value;
          } catch (error) {
            return false;
          }
        },
        message: 'Route path must be a valid gateway path',
      },
    },
    target: {
      type: String,
      required: function targetRequired() {
        return !this.backendInstances || this.backendInstances.length === 0;
      },
      trim: true,
      validate: {
        validator: (value) => {
          try {
            normalizeTarget(value);
            return true;
          } catch (error) {
            return false;
          }
        },
        message: 'Route target must be a valid HTTP or HTTPS URL',
      },
    },
    methods: {
      type: [
        {
          type: String,
          enum: {
            values: SUPPORTED_HTTP_METHODS,
            message: 'Unsupported HTTP method: {VALUE}',
          },
        },
      ],
      required: [true, 'Methods are required'],
      set: (values) => {
        if (!Array.isArray(values)) {
          return values;
        }

        return values.map((value) =>
          typeof value === 'string' ? value.trim().toUpperCase() : value
        );
      },
      validate: {
        validator: (values) => Array.isArray(values) && values.length > 0,
        message: 'At least one HTTP method is required',
      },
    },
    backendInstances: {
      type: [backendInstanceSchema],
      default: undefined,
      validate: {
        validator: (instances) =>
          !instances ||
          instances.length === 0 ||
          new Set(instances.map((instance) => instance.id)).size ===
            instances.length,
        message: 'Backend instance ids must be unique within a route',
      },
    },
    loadBalancingStrategy: {
      type: String,
      enum: {
        values: LOAD_BALANCING_STRATEGIES,
        message: 'Unsupported load-balancing strategy: {VALUE}',
      },
      default: 'round_robin',
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    stripPrefix: {
      type: Boolean,
      default: false,
    },
    authRequired: {
      type: Boolean,
      default: false,
    },
    requiredRoles: {
      type: [{ type: String, trim: true, maxlength: 64 }],
      default: [],
      validate: {
        validator: (roles) =>
          Array.isArray(roles) &&
          roles.length <= 20 &&
          new Set(roles).size === roles.length &&
          roles.every((role) => /^[A-Za-z0-9:_-]{1,64}$/.test(role)),
        message: 'Required roles must be unique valid role names',
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model('Route', routeSchema);
