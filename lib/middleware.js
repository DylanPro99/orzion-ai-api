const Logger = require('./logger');
const { ErrorHandler } = require('./errorHandler');

function requestLoggingMiddleware(req, res, next) {
    const requestId = Logger.generateRequestId();
    const startTime = Date.now();

    req.requestId = requestId;
    req.startTime = startTime;

    Logger.logRequest(req, requestId);

    const originalJson = res.json;
    const originalSend = res.send;
    const originalStatus = res.status;

    let statusCode = 200;

    res.status = function(code) {
        statusCode = code;
        return originalStatus.call(this, code);
    };

    res.json = function(data) {
        Logger.logResponse(req, res, requestId, startTime, statusCode || res.statusCode);
        return originalJson.call(this, data);
    };

    res.send = function(data) {
        Logger.logResponse(req, res, requestId, startTime, statusCode || res.statusCode);
        return originalSend.call(this, data);
    };

    next();
}

function errorHandlerMiddleware(error, req, res, next) {
    const requestId = req.requestId || Logger.generateRequestId();
    return ErrorHandler.handleError(error, req, res, requestId);
}

function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

const ALLOWED_ORIGINS = [
    'http://localhost:5000',
    'http://localhost:3000',
    'https://orzion.pages.dev',
    'https://orzionai.pages.dev',
    'https://orzion-api.vercel.app'
];

function corsMiddleware(req, res, next) {
    const origin = req.headers.origin;
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction) {
        if (origin && (ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.vercel.app') || origin.endsWith('.pages.dev'))) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Access-Control-Allow-Credentials', 'true');
        }
    } else {
        if (origin && (ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.vercel.app'))) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Access-Control-Allow-Credentials', 'true');
        } else {
            res.setHeader('Access-Control-Allow-Origin', '*');
        }
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    next();
}

function setCorsHeaders(req, res) {
    const origin = req.headers.origin;
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction) {
        if (origin && (ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.vercel.app') || origin.endsWith('.pages.dev'))) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Access-Control-Allow-Credentials', 'true');
        }
    } else {
        if (origin && (ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.vercel.app'))) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Access-Control-Allow-Credentials', 'true');
        } else {
            res.setHeader('Access-Control-Allow-Origin', '*');
        }
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function validateRequestBody(requiredFields = []) {
    return (req, res, next) => {
        const missingFields = requiredFields.filter(field => !req.body[field]);

        if (missingFields.length > 0) {
            throw ErrorHandler.BadRequest(
                `Missing required fields: ${missingFields.join(', ')}`,
                'MISSING_REQUIRED_FIELDS',
                { missingFields }
            );
        }

        next();
    };
}

function validateQueryParams(requiredParams = []) {
    return (req, res, next) => {
        const missingParams = requiredParams.filter(param => !req.query[param]);

        if (missingParams.length > 0) {
            throw ErrorHandler.BadRequest(
                `Missing required query parameters: ${missingParams.join(', ')}`,
                'MISSING_QUERY_PARAMS',
                { missingParams }
            );
        }

        next();
    };
}

module.exports = {
    requestLoggingMiddleware,
    errorHandlerMiddleware,
    asyncHandler,
    corsMiddleware,
    setCorsHeaders,
    validateRequestBody,
    validateQueryParams,
    ALLOWED_ORIGINS
};