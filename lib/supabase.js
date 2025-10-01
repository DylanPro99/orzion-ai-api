// ====================================
// ORZION AI - SUPABASE CLIENT
// Database connection and utilities
// ====================================

const { createClient } = require('@supabase/supabase-js');
const { checkUserRateLimits } = require('./rateLimit');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Service role for backend operations

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase configuration. Make sure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Validate API key and get user limits
 * @param {string} apiKey - The API key to validate
 * @returns {Promise<Object>} User information and limits
 */
async function validateApiKey(apiKey) {
    try {
        const { data, error } = await supabase.rpc('validate_api_key', {
            api_key_input: apiKey
        });

        if (error) {
            console.error('Error validating API key:', error);
            return { isValid: false, error: error.message };
        }

        if (!data || data.length === 0) {
            return { isValid: false, error: 'API key not found' };
        }

        const result = data[0];
        return {
            isValid: result.is_valid,
            userId: result.user_id,
            apiKeyId: result.api_key_id,
            plan: result.plan,
            limits: {
                dailyRequests: result.api_limit_daily,
                requestsPerSecond: result.api_limit_per_second,
                tokensPerMinute: result.token_limit_per_minute
            },
            usage: {
                requestsToday: result.api_usage_today,
                tokensToday: result.tokens_used_today
            }
        };
    } catch (error) {
        console.error('Exception validating API key:', error);
        return { isValid: false, error: 'Database error' };
    }
}

/**
 * Check if user has exceeded their limits usando Redis para rate limiting real
 * @param {Object} validation - Result from validateApiKey
 * @param {number} estimatedTokens - Estimated tokens for this request
 * @returns {Promise<Object>} Rate limit check result
 */
async function checkRateLimits(validation, estimatedTokens = 0) {
    const { limits, usage, userId, apiKeyId } = validation;
    
    // Convertir límites al formato esperado por el rate limiter (usando nombres correctos)
    const rateLimits = {
        requestsPerSecond: limits.requestsPerSecond,
        dailyRequests: limits.dailyRequests,
        tokensPerMinute: limits.tokensPerMinute
    };

    // Usar rate limiting con Redis para límites en tiempo real
    const rateLimitResult = await checkUserRateLimits(
        userId,
        apiKeyId,
        rateLimits,
        estimatedTokens
    );

    if (!rateLimitResult.allowed) {
        return {
            allowed: false,
            reason: rateLimitResult.reason,
            message: `Rate limit exceeded: ${rateLimitResult.details?.limit} requests per ${rateLimitResult.details?.resetTime ? 'window' : 'second'}`,
            details: rateLimitResult.details
        };
    }

    // También verificar límites diarios en base de datos como backup
    if (limits.dailyRequests !== -1 && usage.requestsToday >= limits.dailyRequests) {
        return {
            allowed: false,
            reason: 'daily_requests_exceeded_db',
            message: `Daily request limit of ${limits.dailyRequests} exceeded (database check)`
        };
    }

    return { 
        allowed: true,
        rateLimitInfo: rateLimitResult
    };
}

/**
 * Update API usage statistics
 * @param {string} apiKey - The API key used
 * @param {string} endpoint - The endpoint called
 * @param {string} model - The model used
 * @param {number} inputTokens - Number of input tokens
 * @param {number} outputTokens - Number of output tokens
 * @param {number} responseTime - Response time in milliseconds
 * @param {number} statusCode - HTTP status code
 * @param {string} errorMessage - Error message if any
 * @returns {Promise<boolean>} Success status
 */
async function updateApiUsage(apiKey, endpoint, model, inputTokens, outputTokens, responseTime, statusCode, errorMessage = null) {
    try {
        // Calculate cost based on model and plan
        const cost = calculateCost(model, inputTokens, outputTokens);

        const { data, error } = await supabase.rpc('update_api_usage', {
            api_key_input: apiKey,
            endpoint_input: endpoint,
            model_input: model,
            tokens_input_count: inputTokens,
            tokens_output_count: outputTokens,
            cost_input: cost,
            response_time: responseTime,
            status_code_input: statusCode,
            error_msg: errorMessage
        });

        if (error) {
            console.error('Error updating API usage:', error);
            return false;
        }

        return data;
    } catch (error) {
        console.error('Exception updating API usage:', error);
        return false;
    }
}

/**
 * Calculate cost for API usage (for advanced plan)
 * @param {string} model - Model name
 * @param {number} inputTokens - Input tokens
 * @param {number} outputTokens - Output tokens
 * @returns {number} Cost in USD
 */
function calculateCost(model, inputTokens, outputTokens) {
    const pricing = {
        'orzion-pro': {
            input: 1.25 / 1000000,  // $1.25 per million input tokens
            output: 10.00 / 1000000 // $10.00 per million output tokens
        },
        'orzion-turbo': {
            input: 0.20 / 1000000,  // $0.20 per million input tokens
            output: 2.50 / 1000000  // $2.50 per million output tokens
        },
        'orzion-mini': {
            input: 0.075 / 1000000, // $0.075 per million input tokens
            output: 0.30 / 1000000  // $0.30 per million output tokens
        }
    };

    const modelPricing = pricing[model];
    if (!modelPricing) {
        return 0;
    }

    return (inputTokens * modelPricing.input) + (outputTokens * modelPricing.output);
}

/**
 * Estimate tokens for a message (rough estimation)
 * @param {string} text - Text to estimate
 * @returns {number} Estimated token count
 */
function estimateTokens(text) {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
}

/**
 * Get user usage statistics
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Usage statistics
 */
async function getUserUsageStats(userId) {
    try {
        const { data, error } = await supabase.rpc('get_user_usage_stats', {
            user_id_input: userId
        });

        if (error) {
            console.error('Error getting usage stats:', error);
            return null;
        }

        return data[0] || null;
    } catch (error) {
        console.error('Exception getting usage stats:', error);
        return null;
    }
}

module.exports = {
    supabase,
    validateApiKey,
    checkRateLimits,
    updateApiUsage,
    calculateCost,
    estimateTokens,
    getUserUsageStats
};