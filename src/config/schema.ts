/**
 * Configuration Validation Schema
 *
 * Validates config objects against type-safe schema
 * Ensures cache TTL, rate-limits, and Hermes paths are correct
 */

export interface ConfigSchema {
  cacheTtl?: number;
  rateLimitWindowMs?: number;
  rateLimitMaxRequests?: number;
  rateLimitPerConversation?: boolean;
  hermesPaths?: {
    hermesDir?: string;
    storageDir?: string;
  };
}

/**
 * Validate a config object against schema
 */
export function validateConfig(config: unknown): config is ConfigSchema {
  if (typeof config !== "object" || config === null) {
    return false;
  }

  const obj = config as Record<string, any>;

  // Validate cacheTtl if present
  if (obj.cacheTtl !== undefined) {
    if (typeof obj.cacheTtl !== "number" || obj.cacheTtl < 0) {
      return false;
    }
  }

  // Validate rateLimitWindowMs if present
  if (obj.rateLimitWindowMs !== undefined) {
    if (typeof obj.rateLimitWindowMs !== "number" || obj.rateLimitWindowMs <= 0) {
      return false;
    }
  }

  // Validate rateLimitMaxRequests if present
  if (obj.rateLimitMaxRequests !== undefined) {
    if (typeof obj.rateLimitMaxRequests !== "number" || obj.rateLimitMaxRequests <= 0) {
      return false;
    }
  }

  // Validate rateLimitPerConversation if present
  if (obj.rateLimitPerConversation !== undefined) {
    if (typeof obj.rateLimitPerConversation !== "boolean") {
      return false;
    }
  }

  // Validate hermesPaths if present
  if (obj.hermesPaths !== undefined) {
    if (typeof obj.hermesPaths !== "object" || obj.hermesPaths === null) {
      return false;
    }

    const paths = obj.hermesPaths as Record<string, any>;

    if (paths.hermesDir !== undefined && typeof paths.hermesDir !== "string") {
      return false;
    }

    if (paths.storageDir !== undefined && typeof paths.storageDir !== "string") {
      return false;
    }
  }

  return true;
}

/**
 * Get validation errors for a config object
 */
export function getConfigValidationErrors(config: unknown): string[] {
  const errors: string[] = [];

  if (typeof config !== "object" || config === null) {
    return ["Config must be an object"];
  }

  const obj = config as Record<string, any>;

  if (obj.cacheTtl !== undefined) {
    if (typeof obj.cacheTtl !== "number") {
      errors.push("cacheTtl must be a number");
    } else if (obj.cacheTtl < 0) {
      errors.push("cacheTtl must be non-negative");
    }
  }

  if (obj.rateLimitWindowMs !== undefined) {
    if (typeof obj.rateLimitWindowMs !== "number") {
      errors.push("rateLimitWindowMs must be a number");
    } else if (obj.rateLimitWindowMs <= 0) {
      errors.push("rateLimitWindowMs must be positive");
    }
  }

  if (obj.rateLimitMaxRequests !== undefined) {
    if (typeof obj.rateLimitMaxRequests !== "number") {
      errors.push("rateLimitMaxRequests must be a number");
    } else if (obj.rateLimitMaxRequests <= 0) {
      errors.push("rateLimitMaxRequests must be positive");
    }
  }

  if (obj.rateLimitPerConversation !== undefined) {
    if (typeof obj.rateLimitPerConversation !== "boolean") {
      errors.push("rateLimitPerConversation must be a boolean");
    }
  }

  if (obj.hermesPaths !== undefined) {
    if (typeof obj.hermesPaths !== "object" || obj.hermesPaths === null) {
      errors.push("hermesPaths must be an object");
    } else {
      const paths = obj.hermesPaths as Record<string, any>;

      if (paths.hermesDir !== undefined && typeof paths.hermesDir !== "string") {
        errors.push("hermesPaths.hermesDir must be a string");
      }

      if (paths.storageDir !== undefined && typeof paths.storageDir !== "string") {
        errors.push("hermesPaths.storageDir must be a string");
      }
    }
  }

  return errors;
}
