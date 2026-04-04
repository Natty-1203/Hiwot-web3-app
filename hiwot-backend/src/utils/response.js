export function successResponse(res, data, status = 200, pagination = null, meta = {}) {
  const response = {
    success: true,
    data,
    meta: {
      request_id: res.req?.requestId || null,
      timestamp: new Date()?.toISOString(),
      ...meta
    }
  };
  if (pagination) response.pagination = pagination;
  res.status(status).json(response);
}

export function errorResponse(res, errorCode, message, status = 400, details = {}) {
  res.status(status).json({
    success: false,
    error: {
      code: errorCode,
      message,
      details,
      request_id: res.req?.requestId || null
    }
  });
}
