import dotenv from 'dotenv';
dotenv.config();

export const PORT = parseInt(process.env.PORT || '3000', 10);

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: PORT,
  // KHÔNG DÙNG || 'mặc định' ở đây cho các biến nhạy cảm
  mongoUri: process.env.MONGODB_URI,
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '24h',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d'
  },
  cookieSecret: process.env.COOKIE_SECRET,
  gemini: { apiKey: process.env.GEMINI_API_KEY },
  assemblyai: { apiKey: process.env.ASSEMBLYAI_API_KEY },
  murf: { apiKey: process.env.MURF_API_KEY },
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
    subject: process.env.VAPID_SUBJECT || 'mailto:admin@qlhs.vn'
  }
};

// Logic fallback cho môi trường DEV (Chỉ chạy khi dev)
if (config.nodeEnv !== 'production') {
  if (!config.mongoUri) config.mongoUri = 'mongodb://localhost:27017/qlhs';
  if (!config.jwt.accessSecret) config.jwt.accessSecret = 'dev-access-secret';
  if (!config.jwt.refreshSecret) config.jwt.refreshSecret = 'dev-refresh-secret';
  if (!config.cookieSecret) {
    console.warn('⚠️ COOKIE_SECRET missing in DEV. Using default.');
    config.cookieSecret = 'dev-cookie-secret';
  }
}

// Logic check sống còn cho PRODUCTION
if (config.nodeEnv === 'production') {
  const missing = [];
  if (!config.mongoUri) missing.push('MONGODB_URI');
  if (!config.cookieSecret) missing.push('COOKIE_SECRET');
  if (!config.jwt.accessSecret) missing.push('JWT_ACCESS_SECRET');
  if (!config.jwt.refreshSecret) missing.push('JWT_REFRESH_SECRET');

  if (missing.length > 0) {
    throw new Error(`❌ CẤU HÌNH LỖI: Thiếu biến môi trường quan trọng trên Production: ${missing.join(', ')}`);
  }
}
