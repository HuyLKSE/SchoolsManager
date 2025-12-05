import mongoose from 'mongoose';

/**
 * Resolve the schoolId that should be attached to new users/resources.
 * Priority:
 * 1. Provided schoolId (if valid ObjectId)
 * 2. Generate a brand new ObjectId (for first tenant bootstrap or new tenant sign-up)
 */
export const resolveSchoolId = async (preferredId) => {
  if (preferredId !== undefined && preferredId !== null) {
    if (!mongoose.Types.ObjectId.isValid(preferredId)) {
      throw new Error('INVALID_SCHOOL_ID');
    }
    return new mongoose.Types.ObjectId(preferredId);
  }

  return new mongoose.Types.ObjectId();
};

/**
 * Ensure a user document always carries a schoolId so
 * downstream controllers can safely scope queries.
 */
export const ensureUserSchoolId = async (user, preferredId) => {
  if (!user.schoolId) {
    user.schoolId = await resolveSchoolId(preferredId);
    await user.save();
  }
  return user.schoolId;
};
