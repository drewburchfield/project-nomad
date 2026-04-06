import env from '#start/env'
import logger from '@adonisjs/core/services/logger'

/**
 * Validates that a value is a positive integer. If not, logs a warning
 * and returns the default.
 */
function positiveInt(name: string, value: number | undefined, defaultValue: number): number {
  if (value === undefined || value === null) {
    return defaultValue
  }
  if (!Number.isInteger(value) || value < 1) {
    logger.warn(
      `[pipeline config] ${name}=${value} is not a positive integer, using default ${defaultValue}`
    )
    return defaultValue
  }
  return value
}

/**
 * Pipeline configuration for embedding and queue processing.
 * All values are overridable via environment variables with sensible defaults
 * that preserve existing behavior.
 */
const pipelineConfig = {
  /** Timeout in ms for Ollama embed requests (default: 60000) */
  embedTimeout: positiveInt('NOMAD_EMBED_TIMEOUT', env.get('NOMAD_EMBED_TIMEOUT'), 60000),

  /** Number of texts to embed in a single batch (default: 8) */
  embedBatchSize: positiveInt('NOMAD_EMBED_BATCH_SIZE', env.get('NOMAD_EMBED_BATCH_SIZE'), 8),

  /** Number of ZIM articles to process per batch (default: 50) */
  zimBatchSize: positiveInt('NOMAD_ZIM_BATCH_SIZE', env.get('NOMAD_ZIM_BATCH_SIZE'), 50),

  /** Max retry attempts for embed jobs (default: 30) */
  embedMaxRetries: positiveInt('NOMAD_EMBED_MAX_RETRIES', env.get('NOMAD_EMBED_MAX_RETRIES'), 30),

  /** Delay in ms between embed job retries (default: 60000) */
  embedRetryDelay: positiveInt(
    'NOMAD_EMBED_RETRY_DELAY',
    env.get('NOMAD_EMBED_RETRY_DELAY'),
    60000
  ),

  /** BullMQ worker lock duration in ms (default: 300000) */
  queueLockDuration: positiveInt(
    'NOMAD_QUEUE_LOCK_DURATION',
    env.get('NOMAD_QUEUE_LOCK_DURATION'),
    300000
  ),

  /** Concurrency for embed queue workers (default: 2) */
  embedConcurrency: positiveInt('NOMAD_EMBED_CONCURRENCY', env.get('NOMAD_EMBED_CONCURRENCY'), 2),

  /** Chars-per-token estimate for chunk sizing (default: 3) */
  charToTokenRatio: positiveInt(
    'NOMAD_CHAR_TO_TOKEN_RATIO',
    env.get('NOMAD_CHAR_TO_TOKEN_RATIO'),
    3
  ),
}

export default pipelineConfig
