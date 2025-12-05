import dotenv from 'dotenv';
dotenv.config();

export const PORT = parseInt(process.env.PORT || '3000', 10);

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: PORT,
  mongoUri: process.env.MONGODB_URI, // Removed default
  jwt: {
    // KHÔNG dùng || 'string' ở đây
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '24h',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d'
  },
  cookieSecret: process.env.COOKIE_SECRET,
  gemini: {
    apiKey: process.env.GEMINI_API_KEY
  },
  assemblyai: {
    apiKey: process.env.ASSEMBLYAI_API_KEY
  },
  murf: {
    apiKey: process.env.MURF_API_KEY
  },
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
    subject: process.env.VAPID_SUBJECT || 'mailto:admin@qlhs.vn'
  }
};

// Critical validation
if (process.env.NODE_ENV === 'production') {
  const missing = [];
  if (!config.mongoUri) missing.push('MONGODB_URI');
  if (!config.cookieSecret) missing.push('COOKIE_SECRET');
  if (!config.jwt.accessSecret) missing.push('JWT_ACCESS_SECRET');
  if (!config.jwt.refreshSecret) missing.push('JWT_REFRESH_SECRET');

  if (missing.length > 0) {
    throw new Error(`❌ Missing required env vars in production: ${missing.join(', ')}`);
  }
}

if (!config.cookieSecret && process.env.NODE_ENV !== 'production') {
  console.warn('⚠️ COOKIE_SECRET is missing. Using default dev secret. DO NOT USE IN PRODUCTION.');
  config.cookieSecret = 'dev-cookie-secret';
}
if (!config.jwt.accessSecret && process.env.NODE_ENV !== 'production') {
  console.warn('⚠️ JWT_ACCESS_SECRET is missing. Using default dev secret. DO NOT USE IN PRODUCTION.');
  config.jwt.accessSecret = 'dev-access-secret';
}
if (!config.jwt.refreshSecret && process.env.NODE_ENV !== 'production') {
  console.warn('⚠️ JWT_REFRESH_SECRET is missing. Using default dev secret. DO NOT USE IN PRODUCTION.');
  config.jwt.refreshSecret = 'dev-refresh-secret';
}
if (!config.mongoUri && process.env.NODE_ENV !== 'production') {
  // Keep local default only in dev
  config.mongoUri = 'mongodb://localhost:27017/qlhs';
}
