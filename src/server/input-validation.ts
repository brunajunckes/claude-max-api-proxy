/**
 * Input Validation Middleware
 *
 * Validates incoming requests:
 * - JSON structure
 * - Field presence and types
 * - String length limits
 * - Message count limits
 */
import { Request, Response, NextFunction } from 'express';
import { APIError } from './error-handler.js';

const MAX_MESSAGE_LENGTH = 100000;
const MAX_MESSAGES_ARRAY = 1000;
const MAX_SYSTEM_PROMPT_LENGTH = 50000;

export interface ChatCompletionRequest {
  model?: string;
  messages?: Array<{
    role: string;
    content: string;
  }>;
  temperature?: number;
  max_tokens?: number;
  system?: string;
  reasoning_effort?: string;
  thinking?: {
    type?: string;
    budget_tokens?: number;
  };
}

function validateString(value: any, fieldName: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new APIError(
      `Field '${fieldName}' must be a string`,
      400
    );
  }

  if (value.length === 0) {
    throw new APIError(
      `Field '${fieldName}' cannot be empty`,
      400
    );
  }

  if (value.length > maxLength) {
    throw new APIError(
      `Field '${fieldName}' exceeds maximum length of ${maxLength}`,
      400
    );
  }

  return value;
}

function validateChatCompletionRequest(body: any): ChatCompletionRequest {
  if (!body || typeof body !== 'object') {
    throw new APIError('Request body must be a JSON object', 400);
  }

  // Validate model
  if (!body.model || typeof body.model !== 'string') {
    throw new APIError('Field \'model\' is required and must be a string', 400);
  }

  if (!['claude', 'opus', 'sonnet', 'haiku'].includes(body.model)) {
    throw new APIError(
      `Invalid model '${body.model}'. Must be one of: claude, opus, sonnet, haiku`,
      400
    );
  }

  // Validate messages array
  if (!Array.isArray(body.messages)) {
    throw new APIError('Field \'messages\' must be an array', 400);
  }

  if (body.messages.length === 0) {
    throw new APIError('Field \'messages\' cannot be empty', 400);
  }

  if (body.messages.length > MAX_MESSAGES_ARRAY) {
    throw new APIError(
      `Field \'messages\' exceeds maximum of ${MAX_MESSAGES_ARRAY} messages`,
      400
    );
  }

  // Validate each message
  for (let i = 0; i < body.messages.length; i++) {
    const msg = body.messages[i];

    if (!msg || typeof msg !== 'object') {
      throw new APIError(`Message ${i} must be an object`, 400);
    }

    if (!msg.role || typeof msg.role !== 'string') {
      throw new APIError(`Message ${i} must have a 'role' field (string)`, 400);
    }

    if (!['user', 'assistant', 'system'].includes(msg.role)) {
      throw new APIError(
        `Message ${i} has invalid role '${msg.role}'. Must be: user, assistant, system`,
        400
      );
    }

    if (typeof msg.content !== 'string') {
      throw new APIError(`Message ${i} must have a 'content' field (string)`, 400);
    }

    if (msg.content.length > MAX_MESSAGE_LENGTH) {
      throw new APIError(
        `Message ${i} content exceeds maximum length of ${MAX_MESSAGE_LENGTH}`,
        400
      );
    }
  }

  // Validate optional temperature
  if (body.temperature !== undefined) {
    if (typeof body.temperature !== 'number') {
      throw new APIError('Field \'temperature\' must be a number', 400);
    }
    if (body.temperature < 0 || body.temperature > 2) {
      throw new APIError('Field \'temperature\' must be between 0 and 2', 400);
    }
  }

  // Validate optional max_tokens
  if (body.max_tokens !== undefined) {
    if (typeof body.max_tokens !== 'number' || body.max_tokens < 1) {
      throw new APIError('Field \'max_tokens\' must be a positive number', 400);
    }
  }

  // Validate system prompt if provided
  if (body.system) {
    validateString(body.system, 'system', MAX_SYSTEM_PROMPT_LENGTH);
  }

  // Validate reasoning_effort if provided
  if (body.reasoning_effort) {
    if (typeof body.reasoning_effort !== 'string') {
      throw new APIError('Field \'reasoning_effort\' must be a string', 400);
    }

    const validEfforts = ['off', 'low', 'medium', 'high', 'max'];
    if (!validEfforts.includes(body.reasoning_effort)) {
      throw new APIError(
        `Field \'reasoning_effort\' must be one of: ${validEfforts.join(', ')}`,
        400
      );
    }
  }

  return body as ChatCompletionRequest;
}

export function inputValidationMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Only validate POST requests to /v1/chat/completions
  if (req.method === 'POST' && req.path === '/v1/chat/completions') {
    try {
      const validated = validateChatCompletionRequest(req.body);
      (req as any).validatedBody = validated;
    } catch (err) {
      return next(err);
    }
  }

  next();
}
