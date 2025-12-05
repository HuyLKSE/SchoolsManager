const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

export const getPaginationParams = (query = {}, options = {}) => {
  const defaultLimit = options.defaultLimit || DEFAULT_LIMIT;
  const maxLimit = options.maxLimit || MAX_LIMIT;

  const page = Math.max(1, toNumber(query.page, 1));
  const requestedLimit = toNumber(query.limit, defaultLimit);
  const limit = Math.min(Math.max(1, requestedLimit), maxLimit);
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};
