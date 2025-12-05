export const successResponse = (res, data, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

export const errorResponse = (
  res,
  message = 'Error',
  codeOrStatus = 'ERROR',
  statusCode = 500,
  details = []
) => {
  let code = codeOrStatus;
  let status = statusCode;

  if (typeof codeOrStatus === 'number') {
    status = codeOrStatus;
    code = 'ERROR';
  }

  return res.status(status).json({
    error: {
      code,
      message,
      details,
    },
  });
};

export const paginationResponse = (res, data, meta = {}) => {
  const page = parseInt(meta.page ?? 1, 10);
  const limit = parseInt(meta.limit ?? 0, 10);
  const total = meta.total ?? 0;
  const hasNext =
    typeof meta.hasNext === 'boolean' ? meta.hasNext : page * limit < total;

  return res.json({
    data,
    meta: {
      page,
      limit,
      total,
      hasNext,
    },
  });
};
