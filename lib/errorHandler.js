const Logger = require('./logger');

class ApiError extends Error {
    constructor(statusCode, message, code, details = null) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

class ErrorHandler {
    static handleError(error, req, res, requestId) {
        const isDevelopment = process.env.NODE_ENV !== 'production';

        if (error.isOperational) {
            Logger.error('Operational error occurred', {
                requestId,
                errorCode: error.code,
                message: error.message,
                statusCode: error.statusCode,
                details: error.details,
                path: req.url,
                method: req.method
            });

            return res.status(error.statusCode).json({
                error: {
                    message: error.message,
                    code: error.code,
                    request_id: requestId,
                    ...(isDevelopment && error.details && { details: error.details }),
                    ...(isDevelopment && { stack: error.stack })
                }
            });
        }

        Logger.error('Unexpected error occurred', {
            requestId,
            message: error.message,
            stack: error.stack,
            path: req.url,
            method: req.method
        });

        return res.status(500).json({
            error: {
                message: 'Internal server error',
                code: 'INTERNAL_SERVER_ERROR',
                request_id: requestId,
                ...(isDevelopment && { 
                    details: error.message,
                    stack: error.stack 
                })
            }
        });
    }

    static BadRequest(message, code = 'BAD_REQUEST', details = null) {
        return new ApiError(400, message, code, details);
    }

    static Unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED', details = null) {
        return new ApiError(401, message, code, details);
    }

    static Forbidden(message = 'Access forbidden', code = 'FORBIDDEN', details = null) {
        return new ApiError(403, message, code, details);
    }

    static NotFound(message = 'Resource not found', code = 'NOT_FOUND', details = null) {
        return new ApiError(404, message, code, details);
    }

    static MethodNotAllowed(message = 'Method not allowed', code = 'METHOD_NOT_ALLOWED', details = null) {
        return new ApiError(405, message, code, details);
    }

    static Conflict(message = 'Resource conflict', code = 'CONFLICT', details = null) {
        return new ApiError(409, message, code, details);
    }

    static TooManyRequests(message = 'Rate limit exceeded', code = 'RATE_LIMIT_EXCEEDED', details = null) {
        return new ApiError(429, message, code, details);
    }

    static InternalError(message = 'Internal server error', code = 'INTERNAL_SERVER_ERROR', details = null) {
        return new ApiError(500, message, code, details);
    }

    static ServiceUnavailable(message = 'Service unavailable', code = 'SERVICE_UNAVAILABLE', details = null) {
        return new ApiError(503, message, code, details);
    }

    static GatewayTimeout(message = 'Gateway timeout', code = 'GATEWAY_TIMEOUT', details = null) {
        return new ApiError(504, message, code, details);
    }
}

module.exports = { ErrorHandler, ApiError };
