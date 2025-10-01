const { v4: uuidv4 } = require('uuid');

class Logger {
    static LogLevel = {
        ERROR: 'ERROR',
        WARN: 'WARN',
        INFO: 'INFO',
        DEBUG: 'DEBUG'
    };

    static isProduction() {
        return process.env.NODE_ENV === 'production';
    }

    static shouldLog(level) {
        if (this.isProduction()) {
            return level === this.LogLevel.ERROR || level === this.LogLevel.WARN;
        }
        return true;
    }

    static formatLog(level, message, metadata = {}) {
        if (!this.shouldLog(level)) {
            return null;
        }

        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            ...metadata
        };

        const colorCodes = {
            ERROR: '\x1b[31m',
            WARN: '\x1b[33m',
            INFO: '\x1b[36m',
            DEBUG: '\x1b[90m'
        };

        const resetCode = '\x1b[0m';
        const color = colorCodes[level] || '';

        console.log(`${color}[${timestamp}] [${level}] ${message}${resetCode}`, 
            Object.keys(metadata).length > 0 ? JSON.stringify(metadata, null, 2) : '');

        return logEntry;
    }

    static error(message, metadata = {}) {
        return this.formatLog(this.LogLevel.ERROR, message, metadata);
    }

    static warn(message, metadata = {}) {
        return this.formatLog(this.LogLevel.WARN, message, metadata);
    }

    static info(message, metadata = {}) {
        return this.formatLog(this.LogLevel.INFO, message, metadata);
    }

    static debug(message, metadata = {}) {
        return this.formatLog(this.LogLevel.DEBUG, message, metadata);
    }

    static generateRequestId() {
        return `req_${uuidv4().replace(/-/g, '')}`;
    }

    static logRequest(req, requestId) {
        const metadata = {
            requestId,
            method: req.method,
            path: req.url,
            userAgent: req.headers['user-agent'],
            ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
            contentType: req.headers['content-type'],
            contentLength: req.headers['content-length']
        };

        this.info(`Incoming ${req.method} request to ${req.url}`, metadata);
        return metadata;
    }

    static logResponse(req, res, requestId, startTime, statusCode) {
        const duration = Date.now() - startTime;
        const metadata = {
            requestId,
            method: req.method,
            path: req.url,
            statusCode,
            responseTime: `${duration}ms`,
            userAgent: req.headers['user-agent']
        };

        const level = statusCode >= 500 ? this.LogLevel.ERROR :
                     statusCode >= 400 ? this.LogLevel.WARN :
                     this.LogLevel.INFO;

        this.formatLog(level, `Response ${statusCode} for ${req.method} ${req.url}`, metadata);
        return metadata;
    }

    static logDatabaseError(operation, error, metadata = {}) {
        this.error(`Database error during ${operation}`, {
            operation,
            errorMessage: error.message,
            errorCode: error.code,
            errorDetails: error.details,
            errorHint: error.hint,
            ...metadata
        });
    }

    static logApiError(service, error, metadata = {}) {
        const errorData = {
            service,
            errorMessage: error.message,
            statusCode: error.response?.status,
            statusText: error.response?.statusText,
            errorData: error.response?.data,
            ...metadata
        };

        this.error(`API error from ${service}`, errorData);
        return errorData;
    }
}

module.exports = Logger;
