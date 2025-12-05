import { cache } from './cache.js';

export const cacheKeys = {
  dashboardStats: (schoolId) => `dashboard:stats:${schoolId}`,
  userOverview: (userId) => `user:overview:${userId}`,
};

export const invalidateSchoolMetrics = (schoolId) => {
  if (!schoolId) return;
  cache.del(cacheKeys.dashboardStats(schoolId));
};

export const invalidateUserOverview = (userId) => {
  if (!userId) return;
  cache.del(cacheKeys.userOverview(userId));
};
