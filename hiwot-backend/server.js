import mongoose from 'mongoose';
import app from './src/app.js';
import config from './src/config/index.js';
import { startProcessing } from './src/services/queueProcessor.js'; // start after DB connects

mongoose.connect(config.mongoUri)
  .then(() => {
    console.log('Connected to MongoDB');
    // start background queue processing only after DB connection is established
    startProcessing();
    app.listen(config.port, () => {
      console.log(`Hiwot backend running on http://localhost:${config.port}`);
    });
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

  // password: Z8ip9PUfq0oaT02T