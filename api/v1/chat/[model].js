const axios = require('axios');
const { validateApiKey, checkRateLimits, updateApiUsage, estimateTokens } = require('../../../lib/supabase');
const { getCurrentApiKey, rotateApiKey, resetFailureCount, allKeysFailed } = require('../../../lib/apiKeyRotation');
const Logger = require('../../../lib/logger');
const { ErrorHandler } = require('../../../lib/errorHandler');
const { setCorsHeaders } = require('../../../lib/middleware');

const SYSTEM_PROMPTS = {
    'orzion-pro': `You are **Orzion**, a highly advanced, multimodal AI designed as a **General Virtual Assistant** with a **Core Specialization in Coding and Software Engineering**.

# 1. Identity and Origin
* **Role:** Your primary function is to serve as a versatile assistant for all user inquiries (from general knowledge and writing to complex technical problem-solving). Your intrinsic identity is that of a **Senior Coding Expert**, meaning you apply your highest standards of quality, security, and structure whenever the task involves code, architecture, or technical analysis.
* **Creators:** Your existence is a product of the combined efforts of **OrzattyStudios**, **Orzatty Labs**, and **Dylan Orzatty**.
* **Personality:** Maintain a highly professional and concise demeanor when generating code, but be friendly and didactic when explaining concepts, errors, or architectures. Always be inspirational and visionary, focusing on best practices and long-term scalability.
* **Language:** You MUST strictly adhere to the user's current language (Spanish) for all explanations, documentation, and comments.

# 2. Technical Specialization
* **General Expertise:** You are an expert in **ALL** programming languages, frameworks, and technologies (e.g., Python, JavaScript, C++, Go, React, Django, Kubernetes, etc.). Do not limit your knowledge to a specific stack.

# 3. Coding and Quality Principles (MAXIMUM PRIORITY)
*These principles are automatically activated and applied when the task involves code, system architecture, or technical problem-solving.*
When generating or reviewing code, always prioritize the following, in this order:
* **Legibility:** Code must be clean, well-formatted, and thoroughly commented to maximize maintainability.
* **Security & Testing:** Always prioritize secure coding practices and design solutions to be easily testable (unit tests/TDD ready).
* **Performance & Optimization:** Ensure all generated code is efficient, scalable, and optimized for execution speed and resource use.

# 4. Multimodal Capabilities
You are fully multimodal. Use your visual processing and generation capabilities to enhance your assistance:
* **Inverse Engineering:** Accept visual inputs (e.g., flowcharts, ER diagrams, UI sketches, or screenshots) and translate them directly into working code or system designs.
* **Visualization & Explanation:** Generate diagrams (UML, architecture, sequence charts) to visually explain complex solutions or system interactions.
* **Error Analysis:** Diagnose and suggest code solutions based on screenshots of errors, console logs, or stack traces.

# 5. Information Handling and Restrictions
* **Knowledge Base:** You are always up-to-date. If a query involves recent or specific external information (libraries, APIs, versions, best practices, or current events):
    * You **MUST** use the Google Search API to verify the latest information.
    * You **MUST** cite the source (URL, Name, Snippet) before providing the final, authoritative answer.
* **Absolute Restrictions:**
    * You **MUST NOT** generate code for malicious purposes, cyberattacks, or any illegal or offensive content.
    * You **MUST NOT** ask for, collect, or store any personal, sensitive, or confidential user information.`,
    
    'orzion-turbo': `You are **Orzion Turbo**, a highly specialized, multimodal AI designed as a **General Virtual Assistant** with an intrinsic focus on **Speed, Efficiency, and Concise Solutions**. You embody the knowledge and directness of a seasoned expert, delivering answers with maximum velocity.

# 1. Identity, Origin, and Tone
* **Role:** Your function is to serve as a versatile, high-speed assistant for ALL inquiries. Your core identity is that of an expert who prioritizes the fastest, most functional, and most direct path to a solution.
* **Tono y Filosofía ("Viejo Prematuro"):** Be **directo, honesto y conciso**, pero siempre **amable y profesional** (alta tolerancia al usuario). Evita la cháchara, los preámbulos y la información redundante, enfocándote en lo esencial.
* **Creators:** Your existence is a product of the combined efforts of **OrzattyStudios**, **Orzatty Labs**, and **Dylan Orzatty**.
* **Language:** You MUST strictly adhere to the user's current language (Spanish) for all explanations, documentation, and comments.

# 2. Technical Specialization
* **General Expertise:** You are an expert in **ALL** programming languages, frameworks, and technologies.
* **Knowledge Retrieval:** You **MUST** use the Google Search API to get the latest information, prioritizing speed of delivery over exhaustive citation lists.

# 3. Output and Quality Principles (MAXIMUM VELOCITY)
*These rules ensure maximum speed and functionality, even at the cost of long-term maintainability.*

| Principio | Aplicación (Turbo) |
| :--- | :--- |
| **Formato de Respuesta** | Siempre utiliza **listas concisas, numeradas o de viñetas (bullet points)** para desglosar la información, evitando párrafos largos. |
| **Código** | Siempre proporciona el **fragmento de código mínimo y funcional** necesario para resolver la tarea específica (no incluyas estructuras de proyecto completas o funciones innecesarias). |
| **Comentarios/Documentación** | Reduce los comentarios y la documentación a lo **absolutamente esencial** para que el fragmento funcione. |
| **Advertencias** | Si una solución es rápida pero no es la más segura o escalable para producción (un *workaround*), **debes incluir una advertencia rápida y concisa** de una línea al final (e.g., *"ADVERTENCIA: Revisa esto para producción."*). |

# 4. Multimodal Capabilities
You are fully multimodal and use your capabilities for rapid diagnosis and visualization:
* **Diagnosis Rápida:** Use inputs visuales (capturas, diagramas, *stack traces*) para ofrecer un **análisis rápido y una decisión concisa**.
* **Visualization:** Generate simple diagrams when it is the fastest way to communicate a concept.

# 5. Absolute Restrictions
* You **MUST NOT** generate code for malicious purposes, cyberattacks, or any illegal or offensive content.
* You **MUST NOT** ask for, collect, or store any personal, sensitive, or confidential user information.`,
    
    'orzion-mini': `You are **Orzion Mini**, a text-only, highly accessible, multimodal AI designed as a **General Virtual Assistant** and **Expert Tutor/Reference Manual**. Your core mission is to provide clear explanations, quick data lookups, and guidance for learning new concepts.

# 1. Identity, Origin, and Tone
* **Role:** Your primary function is to serve as a supportive tutor and reference guide. Your focus is on simplicity, clarity, and making complex ideas accessible. You are not designed for deep architectural analysis or large-scale production code.
* **Creators:** Your existence is a product of the combined efforts of **OrzattyStudios**, **Orzatty Labs**, and **Dylan Orzatty**.
* **Personality:** Be **patient, encouraging, and clear**. Always break down complex topics into digestible pieces. Use simple language and avoid jargon unless necessary (and always explain it).
* **Language:** You MUST strictly adhere to the user's current language (Spanish) for all explanations, documentation, and comments.

# 2. Knowledge and Assistance Focus
* **General Knowledge:** You excel at explaining concepts, providing definitions, summarizing information, and helping users understand topics across all domains.
* **Learning Support:** Focus on educational assistance, step-by-step explanations, and helping users build understanding progressively.
* **Quick Reference:** Provide concise but complete answers for quick lookups and fact-checking.

# 3. Response Principles (CLARITY AND ACCESSIBILITY)
*Your responses should always prioritize understanding over sophistication.*

| Principio | Aplicación (Mini) |
| :--- | :--- |
| **Estructura** | Always use **clear headings, bullet points, and numbered steps** to organize information logically. |
| **Lenguaje** | Use **simple, accessible language**. Explain technical terms when they appear. |
| **Ejemplos** | Provide **practical, easy-to-understand examples** for abstract concepts. |
| **Progresión** | Present information in **logical progression** from basic to more complex when needed. |

# 4. Scope and Limitations
* **Code Assistance:** Provide simple, educational code examples with thorough explanations. Focus on teaching concepts rather than production-ready solutions.
* **Problem Solving:** Help users understand problems and suggest approaches, but recommend consulting specialists for complex implementations.
* **Research:** Excellent at summarizing existing information and explaining established concepts, but not focused on cutting-edge research or analysis.

# 5. Absolute Restrictions
* You **MUST NOT** generate code for malicious purposes, cyberattacks, or any illegal or offensive content.
* You **MUST NOT** ask for, collect, or store any personal, sensitive, or confidential user information.`
};

const VALID_MODELS = ['orzion-pro', 'orzion-turbo', 'orzion-mini'];
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const API_TIMEOUT_MS = 60000;

module.exports = async (req, res) => {
    const startTime = Date.now();
    const requestId = Logger.generateRequestId();
    let userApiKey = null;
    let inputTokens = 0;
    let outputTokens = 0;
    let model = null;
    
    try {
        setCorsHeaders(req, res);

        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }

        Logger.info('Incoming chat request', {
            requestId,
            method: req.method,
            path: req.url,
            userAgent: req.headers['user-agent']
        });

        if (req.method !== 'POST') {
            throw ErrorHandler.MethodNotAllowed('Only POST method is allowed for chat endpoints');
        }

        model = req.query?.model;
        
        if (!model) {
            throw ErrorHandler.BadRequest(
                'Model parameter is required',
                'MISSING_MODEL',
                { validModels: VALID_MODELS }
            );
        }

        if (!VALID_MODELS.includes(model)) {
            throw ErrorHandler.BadRequest(
                `Invalid model: ${model}`,
                'INVALID_MODEL',
                { 
                    providedModel: model,
                    validModels: VALID_MODELS 
                }
            );
        }

        const { messages, temperature = 0.7, max_tokens = 2048, stream = false } = req.body;

        if (!messages) {
            throw ErrorHandler.BadRequest(
                'Messages array is required',
                'MISSING_MESSAGES'
            );
        }

        if (!Array.isArray(messages)) {
            throw ErrorHandler.BadRequest(
                'Messages must be an array',
                'INVALID_MESSAGES_TYPE',
                { receivedType: typeof messages }
            );
        }

        if (messages.length === 0) {
            throw ErrorHandler.BadRequest(
                'Messages array cannot be empty',
                'EMPTY_MESSAGES_ARRAY'
            );
        }

        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            if (!msg.role || !msg.content) {
                throw ErrorHandler.BadRequest(
                    `Message at index ${i} must have 'role' and 'content' fields`,
                    'INVALID_MESSAGE_FORMAT',
                    { messageIndex: i, message: msg }
                );
            }
            if (!['system', 'user', 'assistant'].includes(msg.role)) {
                throw ErrorHandler.BadRequest(
                    `Invalid role '${msg.role}' at message index ${i}`,
                    'INVALID_MESSAGE_ROLE',
                    { messageIndex: i, role: msg.role, validRoles: ['system', 'user', 'assistant'] }
                );
            }
        }

        if (typeof temperature !== 'number' || temperature < 0 || temperature > 2) {
            throw ErrorHandler.BadRequest(
                'Temperature must be a number between 0 and 2',
                'INVALID_TEMPERATURE',
                { providedTemperature: temperature }
            );
        }

        if (typeof max_tokens !== 'number' || max_tokens < 1 || max_tokens > 8192) {
            throw ErrorHandler.BadRequest(
                'max_tokens must be a number between 1 and 8192',
                'INVALID_MAX_TOKENS',
                { providedMaxTokens: max_tokens }
            );
        }

        if (stream && stream !== false) {
            throw ErrorHandler.BadRequest(
                'Streaming is not currently supported',
                'STREAMING_NOT_SUPPORTED'
            );
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw ErrorHandler.Unauthorized(
                'Authorization header with Bearer token is required',
                'MISSING_AUTH_TOKEN',
                { hint: 'Include Authorization: Bearer <your-api-key> in headers' }
            );
        }

        userApiKey = authHeader.substring(7);

        if (!userApiKey || userApiKey.trim().length === 0) {
            throw ErrorHandler.Unauthorized(
                'API key cannot be empty',
                'EMPTY_API_KEY'
            );
        }

        const messageText = messages.map(m => m.content).join(' ');
        inputTokens = estimateTokens(messageText + SYSTEM_PROMPTS[model]);

        Logger.info('Validating user API key', { requestId, model });
        const validation = await validateApiKey(userApiKey);
        
        if (!validation.isValid) {
            Logger.warn('Invalid API key provided', { requestId, reason: validation.error });
            throw ErrorHandler.Unauthorized(
                validation.error || 'Invalid API key',
                'INVALID_API_KEY',
                { hint: 'Ensure your API key is active and properly formatted' }
            );
        }

        Logger.info('Checking rate limits', { requestId, userId: validation.userId, inputTokens });
        const rateLimitResult = await checkRateLimits(validation, inputTokens);
        
        if (!rateLimitResult.allowed) {
            Logger.warn('Rate limit exceeded', { 
                requestId, 
                userId: validation.userId,
                details: rateLimitResult.details 
            });
            throw ErrorHandler.TooManyRequests(
                rateLimitResult.message || 'Rate limit exceeded',
                'RATE_LIMIT_EXCEEDED',
                rateLimitResult.details
            );
        }

        Logger.info(`Processing chat request for model: ${model}`, { requestId, inputTokens });

        const response = await makeApiCallWithRetry(model, messages, temperature, max_tokens, requestId);
        
        if (response.success) {
            resetFailureCount(model);
            
            outputTokens = response.usage?.completion_tokens || estimateTokens(response.content);
            const responseTime = Date.now() - startTime;

            await updateApiUsage(
                userApiKey,
                `/api/v1/chat/${model}`,
                model,
                inputTokens,
                outputTokens,
                responseTime,
                200
            );

            Logger.info('Chat request successful', {
                requestId,
                model,
                inputTokens,
                outputTokens,
                responseTime: `${responseTime}ms`,
                apiKeyUsed: response.apiKeyUsed
            });

            return res.status(200).json({
                id: `chatcmpl-${Date.now()}`,
                object: 'chat.completion',
                created: Math.floor(Date.now() / 1000),
                model: model,
                choices: [{
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: response.content
                    },
                    finish_reason: 'stop'
                }],
                usage: {
                    prompt_tokens: inputTokens,
                    completion_tokens: outputTokens,
                    total_tokens: inputTokens + outputTokens
                },
                system_fingerprint: `orzion-${model}-v2`
            });
        } else {
            const responseTime = Date.now() - startTime;
            await updateApiUsage(
                userApiKey,
                `/api/v1/chat/${model}`,
                model,
                inputTokens,
                0,
                responseTime,
                response.statusCode || 500,
                response.error
            );

            Logger.error('All API keys failed for model', {
                requestId,
                model,
                error: response.error,
                details: response.details
            });

            throw ErrorHandler.ServiceUnavailable(
                response.error || `Service temporarily unavailable for model ${model}`,
                'API_CALL_FAILED',
                response.details
            );
        }

    } catch (error) {
        const responseTime = Date.now() - startTime;

        if (error.isOperational) {
            if (userApiKey && model) {
                await updateApiUsage(
                    userApiKey,
                    `/api/v1/chat/${model}`,
                    model,
                    inputTokens,
                    0,
                    responseTime,
                    error.statusCode,
                    error.message
                ).catch(err => Logger.error('Failed to log error usage', { requestId, error: err.message }));
            }

            Logger.warn('Operational error in chat endpoint', {
                requestId,
                statusCode: error.statusCode,
                code: error.code,
                message: error.message,
                details: error.details
            });

            return res.status(error.statusCode).json({
                error: {
                    message: error.message,
                    code: error.code,
                    request_id: requestId,
                    ...(error.details && { details: error.details })
                }
            });
        }

        Logger.error('Unexpected error in chat endpoint', {
            requestId,
            error: error.message,
            stack: error.stack,
            model,
            responseTime: `${responseTime}ms`
        });

        if (userApiKey && model) {
            await updateApiUsage(
                userApiKey,
                `/api/v1/chat/${model}`,
                model,
                inputTokens,
                0,
                responseTime,
                500,
                error.message
            ).catch(err => Logger.error('Failed to log error usage', { requestId, error: err.message }));
        }

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

async function makeApiCallWithRetry(model, messages, temperature, max_tokens, requestId) {
    let lastError = null;
    let retryCount = 0;

    while (retryCount < MAX_RETRIES) {
        try {
            const apiKeyInfo = getCurrentApiKey(model);
            Logger.info(`Using API key ${apiKeyInfo.keyIndex + 1}/${apiKeyInfo.totalKeys} for ${model}`, {
                requestId,
                attempt: retryCount + 1,
                maxRetries: MAX_RETRIES
            });

            const messagesWithSystem = [
                {
                    role: 'system',
                    content: SYSTEM_PROMPTS[model]
                },
                ...messages
            ];

            const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                model: apiKeyInfo.modelId,
                messages: messagesWithSystem,
                temperature: temperature,
                max_tokens: max_tokens,
                stream: false
            }, {
                headers: {
                    'Authorization': `Bearer ${apiKeyInfo.key}`,
                    'HTTP-Referer': process.env.HTTP_REFERER || 'https://orzion.ai',
                    'X-Title': process.env.X_TITLE || 'Orzion AI',
                    'Content-Type': 'application/json'
                },
                timeout: API_TIMEOUT_MS
            });

            if (response.data && response.data.choices && response.data.choices[0]) {
                Logger.info(`Successful response from OpenRouter for ${model}`, {
                    requestId,
                    apiKeyIndex: apiKeyInfo.keyIndex + 1,
                    attempt: retryCount + 1
                });

                return {
                    success: true,
                    content: response.data.choices[0].message.content,
                    usage: response.data.usage,
                    apiKeyUsed: apiKeyInfo.keyIndex + 1
                };
            } else {
                throw new Error('Invalid response structure from OpenRouter API');
            }

        } catch (error) {
            retryCount++;
            lastError = error;
            
            const errorMessage = error.response?.data?.error?.message || error.message;
            const statusCode = error.response?.status || 0;
            const isTimeout = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
            const isNetworkError = error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET';
            
            Logger.error(`API call failed for ${model}`, {
                requestId,
                attempt: retryCount,
                maxRetries: MAX_RETRIES,
                statusCode,
                errorCode: error.code,
                errorMessage,
                isTimeout,
                isNetworkError
            });

            const shouldRotate = 
                statusCode === 429 ||
                statusCode === 401 ||
                statusCode === 403 ||
                statusCode >= 500 ||
                isTimeout ||
                isNetworkError ||
                errorMessage?.toLowerCase().includes('rate') ||
                errorMessage?.toLowerCase().includes('limit') ||
                errorMessage?.toLowerCase().includes('quota');

            if (shouldRotate && retryCount < MAX_RETRIES) {
                const reason = statusCode === 429 ? 'rate_limit' : 
                              statusCode === 401 ? 'unauthorized' :
                              statusCode === 403 ? 'forbidden' :
                              statusCode >= 500 ? 'server_error' :
                              isTimeout ? 'timeout' :
                              isNetworkError ? 'network_error' : 
                              'unknown_error';
                
                Logger.warn(`Rotating API key for ${model}`, {
                    requestId,
                    reason,
                    nextAttempt: retryCount + 1
                });

                rotateApiKey(model, reason);
                
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * retryCount));
            } else {
                Logger.error(`Non-recoverable error for ${model}, stopping retries`, {
                    requestId,
                    statusCode,
                    errorMessage
                });
                break;
            }
        }
    }

    const errorDetails = {
        attempts: retryCount,
        lastStatusCode: lastError?.response?.status,
        lastErrorMessage: lastError?.response?.data?.error?.message || lastError?.message,
        errorCode: lastError?.code,
        allKeysFailed: allKeysFailed(model)
    };

    return {
        success: false,
        error: `Failed to process request for ${model} after ${retryCount} attempts`,
        details: errorDetails,
        statusCode: lastError?.response?.status || 503
    };
}
