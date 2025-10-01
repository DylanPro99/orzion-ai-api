const Logger = require('./logger');

const API_KEY_CONFIG = {
    'orzion-pro': {
        modelId: 'qwen/qwen-2.5-72b-instruct:free',
        keys: [
            process.env.ORZION_PRO_API_KEY_1,
            process.env.ORZION_PRO_API_KEY_2,
            process.env.ORZION_PRO_API_KEY_3
        ].filter(key => key),
        currentIndex: 0,
        failureCount: 0
    },
    'orzion-turbo': {
        modelId: 'meta-llama/llama-3.2-3b-instruct:free',
        keys: [
            process.env.ORZION_TURBO_API_KEY_1,
            process.env.ORZION_TURBO_API_KEY_2,
            process.env.ORZION_TURBO_API_KEY_3
        ].filter(key => key),
        currentIndex: 0,
        failureCount: 0
    },
    'orzion-mini': {
        modelId: 'meta-llama/llama-3.2-3b-instruct:free',
        keys: [
            process.env.ORZION_MINI_API_KEY_1,
            process.env.ORZION_MINI_API_KEY_2,
            process.env.ORZION_MINI_API_KEY_3
        ].filter(key => key),
        currentIndex: 0,
        failureCount: 0
    }
};

function getCurrentApiKey(model) {
    const config = API_KEY_CONFIG[model];
    
    if (!config || !config.keys || config.keys.length === 0) {
        Logger.error('No API keys configured for model', { model });
        throw new Error(`No hay claves API configuradas para el modelo: ${model}`);
    }

    const currentKey = config.keys[config.currentIndex];
    
    return {
        key: currentKey,
        keyIndex: config.currentIndex,
        totalKeys: config.keys.length,
        modelId: config.modelId
    };
}

function rotateApiKey(model, reason = 'unknown') {
    const config = API_KEY_CONFIG[model];
    
    if (!config || !config.keys || config.keys.length === 0) {
        Logger.error('Cannot rotate: no keys available for model', { model });
        return;
    }

    const previousIndex = config.currentIndex;
    config.currentIndex = (config.currentIndex + 1) % config.keys.length;
    config.failureCount++;

    Logger.warn('API key rotated', {
        model,
        previousKeyIndex: previousIndex + 1,
        newKeyIndex: config.currentIndex + 1,
        totalKeys: config.keys.length,
        reason,
        failureCount: config.failureCount
    });
    
    if (config.currentIndex === 0 && config.failureCount >= config.keys.length) {
        Logger.warn('Completed full rotation cycle for model', {
            model,
            failureCount: config.failureCount,
            totalKeys: config.keys.length
        });
    }
}

function resetFailureCount(model) {
    const config = API_KEY_CONFIG[model];
    
    if (config) {
        const previousFailures = config.failureCount;
        config.failureCount = 0;
        
        if (previousFailures > 0) {
            Logger.info('Reset failure count for model', {
                model,
                previousFailures
            });
        }
    }
}

function allKeysFailed(model) {
    const config = API_KEY_CONFIG[model];
    
    if (!config || !config.keys || config.keys.length === 0) {
        return true;
    }
    
    return config.failureCount >= config.keys.length;
}

function getRotationStats(model) {
    const config = API_KEY_CONFIG[model];
    
    if (!config) {
        return null;
    }
    
    return {
        model: model,
        totalKeys: config.keys.length,
        currentKeyIndex: config.currentIndex,
        failureCount: config.failureCount,
        allKeysFailed: allKeysFailed(model)
    };
}

function getAllRotationStats() {
    const stats = {};
    
    for (const model in API_KEY_CONFIG) {
        stats[model] = getRotationStats(model);
    }
    
    return stats;
}

module.exports = {
    getCurrentApiKey,
    rotateApiKey,
    resetFailureCount,
    allKeysFailed,
    getRotationStats,
    getAllRotationStats
};
