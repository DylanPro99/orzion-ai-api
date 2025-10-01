const { createClient } = require('@supabase/supabase-js');
const { checkUserRateLimits } = require('./rateLimit');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase configuration. Make sure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

async function checkRateLimits(validation, estimatedTokens = 0) {
    const { limits, usage, userId, apiKeyId } = validation;
    
    const rateLimits = {
        requestsPerSecond: limits.requestsPerSecond,
        dailyRequests: limits.dailyRequests,
        tokensPerMinute: limits.tokensPerMinute
    };

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

async function updateApiUsage(apiKey, endpoint, model, inputTokens, outputTokens, responseTime, statusCode, errorMessage = null) {
    try {
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

function calculateCost(model, inputTokens, outputTokens) {
    const pricing = {
        'orzion-pro': {
            input: 1.25 / 1000000,
            output: 10.00 / 1000000
        },
        'orzion-turbo': {
            input: 0.20 / 1000000,
            output: 2.50 / 1000000
        },
        'orzion-mini': {
            input: 0.075 / 1000000,
            output: 0.30 / 1000000
        }
    };

    const modelPricing = pricing[model];
    if (!modelPricing) {
        return 0;
    }

    return (inputTokens * modelPricing.input) + (outputTokens * modelPricing.output);
}

function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}

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
