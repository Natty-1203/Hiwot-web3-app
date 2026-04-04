import mongoose from 'mongoose';
import User from '../src/models/User.js';
import config from '../src/config/index.js';

const users = [
  {
    email: 'manager@hiwot.org',
    passwordHash: 'manager123',
    role: 'manager',
    name: 'Test Manager',
    walletAddress: 'GCBXXX23',
    apiKey: 'ed7192acb7813dd730036eadc99708a5780c44a8b1d7f490829da7ee68f2b8ca'
  },
  {
    email: 'donor@hiwot.org',
    passwordHash: 'donor123',
    role: 'donor',
    name: 'Test Donor',
    walletAddress: 'GABCD123',
    apiKey: 'a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef1234'
  },
  {
    email: 'agent@hiwot.org',
    passwordHash: 'agent123',
    role: 'agent',
    name: 'Test Agent',
    walletAddress: 'GAGENT001',
    apiKey: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd'
  }
];

async function seed() {
  try {
    await mongoose.connect(config.mongoUri);
    console.log('Connected to MongoDB');

    for (const userData of users) {
      const existing = await User.findOne({ email: userData.email });
      if (!existing) {
        const user = new User(userData);
        await user.save();
        console.log(`Created user: ${userData.email} with API key ${user.apiKey}`);
      } else {
        console.log(`User already exists: ${userData.email}`);
      }
    }

    console.log('Seeding completed');
    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
}

seed();