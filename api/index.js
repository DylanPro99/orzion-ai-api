const Logger = require('../../lib/logger');
const { setCorsHeaders } = require('../../lib/middleware');

export default function handler(req, res) {
    const requestId = Logger.generateRequestId();

    try {
        setCorsHeaders(req, res);

        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }

        if (req.method !== 'GET') {
            Logger.warn('Invalid method for root endpoint', {
                requestId,
                method: req.method,
                path: req.url
            });

            return res.status(405).json({
                error: {
                    message: 'Method not allowed',
                    code: 'METHOD_NOT_ALLOWED',
                    request_id: requestId
                }
            });
        }

        Logger.info('Root endpoint accessed', {
            requestId,
            userAgent: req.headers['user-agent']
        });

        const apiKeys = [
            process.env.ORZION_PRO_API_KEY_1,
            process.env.ORZION_PRO_API_KEY_2,
            process.env.ORZION_PRO_API_KEY_3,
            process.env.ORZION_TURBO_API_KEY_1,
            process.env.ORZION_TURBO_API_KEY_2,
            process.env.ORZION_TURBO_API_KEY_3,
            process.env.ORZION_MINI_API_KEY_1,
            process.env.ORZION_MINI_API_KEY_2,
            process.env.ORZION_MINI_API_KEY_3
        ].filter(key => key);

        res.status(200).json({
            message: '🤖 Bienvenido al Servidor API de Orzion AI',
            description: 'Enterprise-grade API server with comprehensive error handling and logging',
            version: '2.0.0',
            status: 'operational',
            endpoints: {
                authentication: {
                    'GET /api/keys': 'List all API keys (requires authentication)',
                    'POST /api/keys': 'Create new API key (requires authentication)',
                    'PATCH /api/keys': 'Update API key (requires authentication)',
                    'DELETE /api/keys': 'Delete API key (requires authentication)'
                },
                chat: {
                    'POST /api/v1/chat/orzion-pro': 'Advanced model for deep analysis and coding',
                    'POST /api/v1/chat/orzion-turbo': 'Fast model for quick responses',
                    'POST /api/v1/chat/orzion-mini': 'Lightweight model for simple queries'
                }
            },
            features: {
                errorHandling: 'Comprehensive error handling with detailed messages',
                logging: 'Enterprise-level logging with request tracking',
                rateLimit: 'Intelligent rate limiting and quota management',
                apiKeyRotation: 'Automatic API key rotation for high availability',
                monitoring: 'Full observability with request IDs and response times'
            },
            api_keys_configured: apiKeys.length,
            api_keys_by_model: {
                'orzion-pro': [
                    process.env.ORZION_PRO_API_KEY_1,
                    process.env.ORZION_PRO_API_KEY_2,
                    process.env.ORZION_PRO_API_KEY_3
                ].filter(k => k).length,
                'orzion-turbo': [
                    process.env.ORZION_TURBO_API_KEY_1,
                    process.env.ORZION_TURBO_API_KEY_2,
                    process.env.ORZION_TURBO_API_KEY_3
                ].filter(k => k).length,
                'orzion-mini': [
                    process.env.ORZION_MINI_API_KEY_1,
                    process.env.ORZION_MINI_API_KEY_2,
                    process.env.ORZION_MINI_API_KEY_3
                ].filter(k => k).length
            },
            environment: 'Next.js on Vercel',
            request_id: requestId
        });
    } catch (error) {
        Logger.error('Unexpected error in root endpoint', {
            requestId,
            error: error.message,
            stack: error.stack
        });

        return res.status(500).json({
            error: {
                message: 'Internal server error',
                code: 'INTERNAL_SERVER_ERROR',
                request_id: requestId
            }
        });
    }
}
