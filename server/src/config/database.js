import mongoose from 'mongoose';
import { config } from './env.js';

/**
 * MongoDB connection with optimized settings
 * - Connection pooling for better performance
 * - Automatic reconnection handling
 * - Index building in background
 */
export async function connectDB() {
  try {
    const options = {
      maxPoolSize: 10, // Maximum number of connections in the pool
      minPoolSize: 2,  // Minimum number of connections
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
      serverSelectionTimeoutMS: 5000, // Timeout for server selection
      family: 4, // Use IPv4, skip trying IPv6
      autoIndex: config.nodeEnv === 'development', // Build indexes in dev only
    };

    await mongoose.connect(config.mongoUri, options);
    
    console.log('✅ MongoDB connected');
    console.log(`📊 Connection pool: min=${options.minPoolSize}, max=${options.maxPoolSize}`);
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
    });

  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    throw error;
  }
}

/**
 * Graceful shutdown
 */
export async function disconnectDB() {
  try {
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');
  } catch (error) {
    console.error('❌ Error closing MongoDB connection:', error.message);
  }
}
