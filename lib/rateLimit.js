const { Client } = require('pg');
const Logger = require('./logger');

let pgClient = null;

async function initializeDatabase() {
    if (!process.env.DATABASE_URL) {
        Logger.warn('DATABASE_URL no configurado, rate limiting deshabilitado');
        return null;
    }

    try {
        pgClient = new Client({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });
        
        await pgClient.connect();
        
        await pgClient.query(`
            CREATE TABLE IF NOT EXISTS rate_limits (
                key VARCHAR(255) PRIMARY KEY,
                count INTEGER DEFAULT 0,
                reset_time BIGINT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pgClient.query(`
            CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_time 
            ON rate_limits(reset_time)
        `);

        Logger.info('Base de datos PostgreSQL configurada para rate limiting');
        return pgClient;
    } catch (error) {
        Logger.error('Error conectando a PostgreSQL', { error: error.message, stack: error.stack });
        return null;
    }
}

initializeDatabase();

async function checkRateLimit(key, limit, windowMs, increment = 1) {
    if (!pgClient) {
        Logger.warn('PostgreSQL no configurado, rate limiting deshabilitado');
        return {
            allowed: true,
            count: 0,
            remaining: limit,
            resetTime: Date.now() + windowMs
        };
    }

    if (limit === -1) {
        return {
            allowed: true,
            count: 0,
            remaining: -1,
            resetTime: null
        };
    }

    try {
        const now = Date.now();
        const window = Math.floor(now / windowMs);
        const dbKey = `ratelimit:${key}:${window}`;
        const resetTime = (window + 1) * windowMs;

        await pgClient.query('BEGIN');

        try {
            await pgClient.query(
                'DELETE FROM rate_limits WHERE reset_time < $1',
                [now]
            );

            const selectResult = await pgClient.query(
                'SELECT count FROM rate_limits WHERE key = $1',
                [dbKey]
            );

            let currentCount;
            if (selectResult.rows.length === 0) {
                await pgClient.query(
                    'INSERT INTO rate_limits (key, count, reset_time) VALUES ($1, $2, $3)',
                    [dbKey, increment, resetTime]
                );
                currentCount = increment;
            } else {
                currentCount = selectResult.rows[0].count + increment;
                await pgClient.query(
                    'UPDATE rate_limits SET count = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2',
                    [currentCount, dbKey]
                );
            }

            await pgClient.query('COMMIT');

            const allowed = currentCount <= limit;
            const remaining = Math.max(0, limit - currentCount);

            return {
                allowed,
                count: currentCount,
                remaining,
                resetTime,
                limit
            };
        } catch (error) {
            await pgClient.query('ROLLBACK');
            throw error;
        }
    } catch (error) {
        Logger.error('Error en rate limiting PostgreSQL', { error: error.message, stack: error.stack });
        return {
            allowed: true,
            count: 0,
            remaining: limit,
            resetTime: Date.now() + windowMs,
            error: error.message
        };
    }
}

async function checkUserRateLimits(userId, apiKeyId, limits, tokenIncrement = 0) {
    const checks = [];

    if (limits.requestsPerSecond && limits.requestsPerSecond !== -1) {
        checks.push(
            checkRateLimit(
                `user:${userId}:requests_per_second`,
                limits.requestsPerSecond,
                1000
            )
        );
    }

    if (limits.dailyRequests && limits.dailyRequests !== -1) {
        checks.push(
            checkRateLimit(
                `user:${userId}:daily_requests`,
                limits.dailyRequests,
                24 * 60 * 60 * 1000
            )
        );
    }

    if (limits.tokensPerMinute && limits.tokensPerMinute !== -1 && tokenIncrement > 0) {
        checks.push(
            checkRateLimit(
                `user:${userId}:tokens_per_minute`,
                limits.tokensPerMinute,
                60 * 1000,
                tokenIncrement
            )
        );
    }

    try {
        const results = await Promise.all(checks);
        
        for (const result of results) {
            if (!result.allowed) {
                return {
                    allowed: false,
                    reason: 'rate_limit_exceeded',
                    details: result,
                    limits
                };
            }
        }

        return {
            allowed: true,
            checks: results,
            limits
        };
    } catch (error) {
        Logger.error('Error verificando rate limits', { error: error.message, stack: error.stack });
        return {
            allowed: true,
            error: error.message,
            limits
        };
    }
}

async function cleanupExpiredCounters(olderThan = Date.now()) {
    if (!pgClient) return 0;

    try {
        const result = await pgClient.query(
            'DELETE FROM rate_limits WHERE reset_time < $1',
            [olderThan]
        );
        return result.rowCount || 0;
    } catch (error) {
        Logger.error('Error limpiando contadores', { error: error.message });
        return 0;
    }
}

async function getUserRateStats(userId) {
    if (!pgClient) return null;

    try {
        const now = Date.now();
        
        const results = await Promise.all([
            pgClient.query(
                'SELECT count FROM rate_limits WHERE key = $1',
                [`ratelimit:user:${userId}:requests_per_second:${Math.floor(now / 1000)}`]
            ),
            pgClient.query(
                'SELECT count FROM rate_limits WHERE key = $1',
                [`ratelimit:user:${userId}:daily_requests:${Math.floor(now / (24 * 60 * 60 * 1000))}`]
            ),
            pgClient.query(
                'SELECT count FROM rate_limits WHERE key = $1',
                [`ratelimit:user:${userId}:tokens_per_minute:${Math.floor(now / (60 * 1000))}`]
            )
        ]);

        return {
            currentRequestsPerSecond: results[0].rows[0]?.count || 0,
            currentDailyRequests: results[1].rows[0]?.count || 0,
            currentTokensPerMinute: results[2].rows[0]?.count || 0,
            timestamp: now
        };
    } catch (error) {
        Logger.error('Error obteniendo stats de rate limiting', { error: error.message });
        return null;
    }
}

module.exports = {
    checkRateLimit,
    checkUserRateLimits,
    cleanupExpiredCounters,
    getUserRateStats,
    isRedisAvailable: () => pgClient !== null
};
