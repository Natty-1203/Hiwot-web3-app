import User from '../models/User.js';
import { errorResponse } from '../utils/response.js';

export const authenticateApiKey = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return errorResponse(res, 'UNAUTHORIZED', 'API key required', 401);
  }

  const user = await User.findOne({ apiKey }).select('-passwordHash');
  if (!user) {
    return errorResponse(res, 'UNAUTHORIZED', 'Invalid API key', 401);
  }

  req.user = user;
  next();
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) return errorResponse(res, 'UNAUTHORIZED', 'Not authenticated', 401);
    if (!roles.includes(req.user.role)) {
      return errorResponse(res, 'FORBIDDEN', 'You do not have permission to access this resource', 403);
    }
    next();
  };
};