const { supabase } = require('../../lib/supabase');
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

        Logger.info('API Keys request received', {
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

        switch (req.method) {
            case 'GET':
                return await handleGetApiKeys(req, res, user.id, requestId);
            case 'POST':
                return await handleCreateApiKey(req, res, user.id, requestId);
            case 'PATCH':
                return await handleUpdateApiKey(req, res, user.id, requestId);
            case 'DELETE':
                return await handleDeleteApiKey(req, res, user.id, requestId);
            default:
                throw ErrorHandler.MethodNotAllowed(
                    `Method ${req.method} is not allowed for this endpoint`,
                    'METHOD_NOT_ALLOWED',
                    { allowedMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] }
                );
        }
    } catch (error) {
        const responseTime = Date.now() - startTime;

        if (error.isOperational) {
            Logger.warn('Operational error in API keys endpoint', {
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

        Logger.error('Unexpected error in API keys endpoint', {
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

async function handleGetApiKeys(req, res, userId, requestId) {
    try {
        Logger.info('Fetching API keys', { requestId, userId });

        const { data, error } = await supabase
            .from('api_keys')
            .select('id, api_key_preview, name, is_active, usage_count, last_used, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            Logger.logDatabaseError('fetch API keys', error, { requestId, userId });
            
            throw ErrorHandler.InternalError(
                'Failed to retrieve API keys from database',
                'DATABASE_ERROR',
                {
                    operation: 'SELECT',
                    table: 'api_keys',
                    supabaseError: error.message,
                    errorCode: error.code,
                    hint: error.hint
                }
            );
        }

        Logger.info('API keys retrieved successfully', {
            requestId,
            userId,
            count: data.length
        });

        return res.json({
            success: true,
            api_keys: data || [],
            count: data?.length || 0
        });
    } catch (error) {
        if (error.isOperational) throw error;

        Logger.error('Unexpected error fetching API keys', {
            requestId,
            userId,
            error: error.message
        });

        throw ErrorHandler.InternalError(
            'An unexpected error occurred while fetching API keys',
            'FETCH_API_KEYS_FAILED',
            { originalError: error.message }
        );
    }
}

async function handleCreateApiKey(req, res, userId, requestId) {
    try {
        const { name } = req.body;

        if (!name) {
            throw ErrorHandler.BadRequest(
                'API key name is required',
                'MISSING_NAME',
                { hint: 'Include "name" field in request body' }
            );
        }

        if (typeof name !== 'string') {
            throw ErrorHandler.BadRequest(
                'API key name must be a string',
                'INVALID_NAME_TYPE',
                { receivedType: typeof name }
            );
        }

        const trimmedName = name.trim();

        if (trimmedName.length === 0) {
            throw ErrorHandler.BadRequest(
                'API key name cannot be empty',
                'EMPTY_NAME'
            );
        }

        if (trimmedName.length > 100) {
            throw ErrorHandler.BadRequest(
                'API key name is too long',
                'NAME_TOO_LONG',
                { maxLength: 100, providedLength: trimmedName.length }
            );
        }

        Logger.info('Checking API key limit', { requestId, userId });

        const { count, error: countError } = await supabase
            .from('api_keys')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);

        if (countError) {
            Logger.logDatabaseError('count API keys', countError, { requestId, userId });
            
            throw ErrorHandler.InternalError(
                'Failed to check API key limit',
                'DATABASE_ERROR',
                {
                    operation: 'COUNT',
                    table: 'api_keys',
                    supabaseError: countError.message
                }
            );
        }

        const maxApiKeys = 10;
        if (count >= maxApiKeys) {
            Logger.warn('API key limit reached', {
                requestId,
                userId,
                currentCount: count,
                maxLimit: maxApiKeys
            });

            throw ErrorHandler.BadRequest(
                `Maximum API key limit reached (${maxApiKeys} keys per user)`,
                'API_KEY_LIMIT_REACHED',
                {
                    currentCount: count,
                    maxLimit: maxApiKeys,
                    hint: 'Delete unused API keys before creating new ones'
                }
            );
        }

        Logger.info('Generating new API key', { requestId, userId, name: trimmedName });

        const { data, error } = await supabase.rpc('generate_api_key_for_user', {
            user_id_input: userId,
            key_name: trimmedName
        });

        if (error) {
            Logger.logDatabaseError('generate API key', error, { requestId, userId });
            
            throw ErrorHandler.InternalError(
                'Failed to generate API key',
                'DATABASE_ERROR',
                {
                    operation: 'RPC generate_api_key_for_user',
                    supabaseError: error.message,
                    errorCode: error.code,
                    hint: error.hint
                }
            );
        }

        if (!data || data.length === 0) {
            throw ErrorHandler.InternalError(
                'API key generation returned no data',
                'EMPTY_RESPONSE'
            );
        }

        const result = data[0];
        
        if (!result.success) {
            Logger.error('API key generation failed', {
                requestId,
                userId,
                errorMessage: result.error_message
            });

            throw ErrorHandler.InternalError(
                'API key generation failed',
                'GENERATION_FAILED',
                { reason: result.error_message }
            );
        }

        Logger.info('API key created successfully', {
            requestId,
            userId,
            apiKeyId: result.api_key_id,
            name: trimmedName
        });

        return res.status(201).json({
            success: true,
            message: 'API key created successfully',
            api_key: result.api_key,
            api_key_id: result.api_key_id,
            name: trimmedName,
            warning: 'This API key will only be shown once. Please store it securely.'
        });
    } catch (error) {
        if (error.isOperational) throw error;

        Logger.error('Unexpected error creating API key', {
            requestId,
            userId,
            error: error.message
        });

        throw ErrorHandler.InternalError(
            'An unexpected error occurred while creating API key',
            'CREATE_API_KEY_FAILED',
            { originalError: error.message }
        );
    }
}

async function handleUpdateApiKey(req, res, userId, requestId) {
    try {
        const { api_key_id, is_active, name } = req.body;

        if (!api_key_id) {
            throw ErrorHandler.BadRequest(
                'API key ID is required',
                'MISSING_API_KEY_ID',
                { hint: 'Include "api_key_id" field in request body' }
            );
        }

        if (typeof api_key_id !== 'string' && typeof api_key_id !== 'number') {
            throw ErrorHandler.BadRequest(
                'API key ID must be a string or number',
                'INVALID_API_KEY_ID_TYPE',
                { receivedType: typeof api_key_id }
            );
        }

        const updateFields = {};
        
        if (is_active !== undefined) {
            if (typeof is_active !== 'boolean') {
                throw ErrorHandler.BadRequest(
                    'is_active must be a boolean',
                    'INVALID_IS_ACTIVE_TYPE',
                    { receivedType: typeof is_active }
                );
            }
            updateFields.is_active = is_active;
        }
        
        if (name !== undefined) {
            if (typeof name !== 'string') {
                throw ErrorHandler.BadRequest(
                    'name must be a string',
                    'INVALID_NAME_TYPE',
                    { receivedType: typeof name }
                );
            }

            const trimmedName = name.trim();
            
            if (trimmedName.length === 0) {
                throw ErrorHandler.BadRequest(
                    'API key name cannot be empty',
                    'EMPTY_NAME'
                );
            }

            if (trimmedName.length > 100) {
                throw ErrorHandler.BadRequest(
                    'API key name is too long',
                    'NAME_TOO_LONG',
                    { maxLength: 100, providedLength: trimmedName.length }
                );
            }

            updateFields.name = trimmedName;
        }

        if (Object.keys(updateFields).length === 0) {
            throw ErrorHandler.BadRequest(
                'No fields to update',
                'NO_UPDATE_FIELDS',
                { hint: 'Provide at least one field to update (name or is_active)' }
            );
        }

        Logger.info('Updating API key', {
            requestId,
            userId,
            apiKeyId: api_key_id,
            updateFields: Object.keys(updateFields)
        });

        const { data, error } = await supabase
            .from('api_keys')
            .update(updateFields)
            .eq('id', api_key_id)
            .eq('user_id', userId)
            .select();

        if (error) {
            Logger.logDatabaseError('update API key', error, {
                requestId,
                userId,
                apiKeyId: api_key_id
            });
            
            throw ErrorHandler.InternalError(
                'Failed to update API key',
                'DATABASE_ERROR',
                {
                    operation: 'UPDATE',
                    table: 'api_keys',
                    supabaseError: error.message,
                    errorCode: error.code,
                    hint: error.hint
                }
            );
        }

        if (!data || data.length === 0) {
            Logger.warn('API key not found for update', {
                requestId,
                userId,
                apiKeyId: api_key_id
            });

            throw ErrorHandler.NotFound(
                'API key not found',
                'API_KEY_NOT_FOUND',
                {
                    apiKeyId: api_key_id,
                    hint: 'The API key may not exist or does not belong to your account'
                }
            );
        }

        Logger.info('API key updated successfully', {
            requestId,
            userId,
            apiKeyId: api_key_id,
            updatedFields: Object.keys(updateFields)
        });

        return res.json({
            success: true,
            message: 'API key updated successfully',
            api_key: {
                id: data[0].id,
                name: data[0].name,
                is_active: data[0].is_active
            }
        });
    } catch (error) {
        if (error.isOperational) throw error;

        Logger.error('Unexpected error updating API key', {
            requestId,
            userId,
            error: error.message
        });

        throw ErrorHandler.InternalError(
            'An unexpected error occurred while updating API key',
            'UPDATE_API_KEY_FAILED',
            { originalError: error.message }
        );
    }
}

async function handleDeleteApiKey(req, res, userId, requestId) {
    try {
        const { api_key_id } = req.body;

        if (!api_key_id) {
            throw ErrorHandler.BadRequest(
                'API key ID is required',
                'MISSING_API_KEY_ID',
                { hint: 'Include "api_key_id" field in request body' }
            );
        }

        if (typeof api_key_id !== 'string' && typeof api_key_id !== 'number') {
            throw ErrorHandler.BadRequest(
                'API key ID must be a string or number',
                'INVALID_API_KEY_ID_TYPE',
                { receivedType: typeof api_key_id }
            );
        }

        Logger.info('Deleting API key', {
            requestId,
            userId,
            apiKeyId: api_key_id
        });

        const { data, error } = await supabase
            .from('api_keys')
            .delete()
            .eq('id', api_key_id)
            .eq('user_id', userId)
            .select();

        if (error) {
            Logger.logDatabaseError('delete API key', error, {
                requestId,
                userId,
                apiKeyId: api_key_id
            });
            
            throw ErrorHandler.InternalError(
                'Failed to delete API key',
                'DATABASE_ERROR',
                {
                    operation: 'DELETE',
                    table: 'api_keys',
                    supabaseError: error.message,
                    errorCode: error.code,
                    hint: error.hint
                }
            );
        }

        if (!data || data.length === 0) {
            Logger.warn('API key not found for deletion', {
                requestId,
                userId,
                apiKeyId: api_key_id
            });

            throw ErrorHandler.NotFound(
                'API key not found',
                'API_KEY_NOT_FOUND',
                {
                    apiKeyId: api_key_id,
                    hint: 'The API key may not exist or does not belong to your account'
                }
            );
        }

        Logger.info('API key deleted successfully', {
            requestId,
            userId,
            apiKeyId: api_key_id
        });

        return res.json({
            success: true,
            message: 'API key deleted successfully',
            deleted_api_key_id: api_key_id
        });
    } catch (error) {
        if (error.isOperational) throw error;

        Logger.error('Unexpected error deleting API key', {
            requestId,
            userId,
            error: error.message
        });

        throw ErrorHandler.InternalError(
            'An unexpected error occurred while deleting API key',
            'DELETE_API_KEY_FAILED',
            { originalError: error.message }
        );
    }
}
