import dotenv from 'dotenv';
dotenv.config();

export const PORT = parseInt(process.env.PORT || '3000', 10);

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: PORT,
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/qlhs',
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
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
  if (!config.mongoUri) throw new Error('❌ MONGODB_URI is required in production');
  if (!config.cookieSecret) throw new Error('❌ COOKIE_SECRET is required in production');
  if (!config.jwt.accessSecret) throw new Error('❌ JWT_ACCESS_SECRET is required in production');
}

if (!config.cookieSecret && process.env.NODE_ENV !== 'production') {
  console.warn('⚠️ COOKIE_SECRET is missing. Using default dev secret. DO NOT USE IN PRODUCTION.');
  config.cookieSecret = 'dev-cookie-secret';
}
