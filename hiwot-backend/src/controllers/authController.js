import User from '../models/User.js';
import { successResponse, errorResponse } from '../utils/response.js';

export const register = async (req, res) => {
  try {
    const { email, password, role, name, walletAddress } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return errorResponse(res, 'VALIDATION_ERROR', 'Email already exists', 400);

    const user = new User({ email, passwordHash: password, role, name, walletAddress });
    await user.save();

    successResponse(res, {
      user: { id: user._id, email: user.email, role: user.role, name: user.name, apiKey: user.apiKey }
    }, 201);
  } catch (error) {
    console.error('Register error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return errorResponse(res, 'AUTH_ERROR', 'Invalid credentials', 401);

    const isValid = await user.comparePassword(password);
    if (!isValid) return errorResponse(res, 'AUTH_ERROR', 'Invalid credentials', 401);

    successResponse(res, {
      user: { id: user._id, email: user.email, role: user.role, name: user.name, apiKey: user.apiKey }
    });
  } catch (error) {
    console.error('Login error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
};