const { supabase, getUserUsageStats } = require('../../lib/supabase');
const Logger = require('../../lib/logger');
const { ErrorHandler } = require('../../lib/errorHandler');
const { setCorsHeaders } = require('../../lib/middleware');

module.exports = async (req, res) => {
    const requestId = Logger.generateRequestId();
    const startTime = Date.now();

    try {
        setCorsHeaders(req, res);

        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }

        if (req.method !== 'GET') {
            throw ErrorHandler.MethodNotAllowed(
                `Method ${req.method} is not allowed for this endpoint`,
                'METHOD_NOT_ALLOWED',
                { allowedMethods: ['GET', 'OPTIONS'] }
            );
        }

        Logger.info('Usage stats request received', {
            requestId,
            method: req.method,
            path: req.url,
            userAgent: req.headers['user-agent']
        });

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw ErrorHandler.Unauthorized(
                'Authorization header with Bearer token is required',
                'MISSING_AUTH_TOKEN',
                { hint: 'Include Authorization: Bearer <your-token> in headers' }
            );
        }

        const token = authHeader.substring(7);

        if (!token || token.trim().length === 0) {
            throw ErrorHandler.Unauthorized(
                'Authentication token cannot be empty',
                'EMPTY_AUTH_TOKEN'
            );
        }

        Logger.debug('Verifying user authentication', { requestId });

        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        
        if (authError) {
            Logger.warn('Authentication error', {
                requestId,
                error: authError.message,
                errorCode: authError.code
            });

            throw ErrorHandler.Unauthorized(
                'Invalid or expired authentication token',
                'INVALID_AUTH_TOKEN',
                {
                    hint: 'Your session may have expired. Please log in again.',
                    supabaseError: authError.message
                }
            );
        }

        if (!user) {
            throw ErrorHandler.Unauthorized(
                'User not found',
                'USER_NOT_FOUND',
                { hint: 'The authentication token does not correspond to any user' }
            );
        }

        Logger.info('User authenticated successfully', {
            requestId,
            userId: user.id,
            userEmail: user.email
        });

        Logger.info('Fetching usage statistics', { requestId, userId: user.id });

        const stats = await getUserUsageStats(user.id);

        if (!stats) {
            throw ErrorHandler.InternalError(
                'Failed to retrieve usage statistics',
                'STATS_RETRIEVAL_FAILED',
                { hint: 'Could not fetch usage data from database' }
            );
        }

        const responseTime = Date.now() - startTime;

        Logger.info('Usage statistics retrieved successfully', {
            requestId,
            userId: user.id,
            responseTime: `${responseTime}ms`
        });

        return res.status(200).json({
            success: true,
            stats: {
                requests: {
                    today: stats.requests_today || 0,
                    total: stats.total_requests || 0,
                    limit: stats.daily_limit === -1 ? null : stats.daily_limit,
                    remaining: stats.daily_limit === -1 ? null : Math.max(0, stats.daily_limit - (stats.requests_today || 0)),
                    percentage: stats.daily_limit === -1 ? 0 : Math.min(100, ((stats.requests_today || 0) / stats.daily_limit) * 100)
                },
                tokens: {
                    today: stats.tokens_today || 0,
                    total: stats.total_tokens || 0,
                    limit: stats.token_limit_per_minute === -1 ? null : stats.token_limit_per_minute,
                    percentage: stats.token_limit_per_minute === -1 ? 0 : Math.min(100, ((stats.tokens_today || 0) / stats.token_limit_per_minute) * 100)
                },
                costs: {
                    today: stats.cost_today || 0,
                    total: stats.total_cost || 0
                },
                models: {
                    'orzion-pro': {
                        requests: stats.orzion_pro_requests || 0,
                        tokens: stats.orzion_pro_tokens || 0,
                        cost: stats.orzion_pro_cost || 0
                    },
                    'orzion-turbo': {
                        requests: stats.orzion_turbo_requests || 0,
                        tokens: stats.orzion_turbo_tokens || 0,
                        cost: stats.orzion_turbo_cost || 0
                    },
                    'orzion-mini': {
                        requests: stats.orzion_mini_requests || 0,
                        tokens: stats.orzion_mini_tokens || 0,
                        cost: stats.orzion_mini_cost || 0
                    }
                },
                limits: {
                    dailyRequests: stats.daily_limit === -1 ? 'unlimited' : stats.daily_limit,
                    requestsPerSecond: stats.requests_per_second === -1 ? 'unlimited' : stats.requests_per_second,
                    tokensPerMinute: stats.token_limit_per_minute === -1 ? 'unlimited' : stats.token_limit_per_minute
                },
                plan: stats.plan || 'basic',
                lastUsage: stats.last_usage_date || null
            },
            timestamp: new Date().toISOString(),
            request_id: requestId
        });

    } catch (error) {
        const responseTime = Date.now() - startTime;

        if (error.isOperational) {
            Logger.warn('Operational error in usage stats endpoint', {
                requestId,
                statusCode: error.statusCode,
                code: error.code,
                message: error.message,
                responseTime: `${responseTime}ms`
            });

            return res.status(error.statusCode).json({
                error: {
                    message: error.message,
                    code: error.code,
                    request_id: requestId,
                    ...(process.env.NODE_ENV !== 'production' && error.details && { details: error.details })
                }
            });
        }

        Logger.error('Unexpected error in usage stats endpoint', {
            requestId,
            error: error.message,
            stack: error.stack,
            method: req.method,
            responseTime: `${responseTime}ms`
        });

        return res.status(500).json({
            error: {
                message: 'An unexpected error occurred',
                code: 'INTERNAL_SERVER_ERROR',
                request_id: requestId,
                ...(process.env.NODE_ENV !== 'production' && { 
                    details: error.message 
                })
            }
        });
    }
};
