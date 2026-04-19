/**
 * ETL Pipeline Orchestrator
 * Phase 2: Real-time data pipeline management
 */

interface PipelineStage {
  name: string;
  type: 'extraction' | 'transformation' | 'loading';
  source: string;
  target: string;
  schedule: string; // cron format
  retryPolicy: {
    maxAttempts: number;
    backoffMs: number;
  };
}

interface ETLPipeline {
  id: string;
  stages: PipelineStage[];
  monitoring: {
    healthCheckInterval: number;
    alertThreshold: number;
  };
}

const pipelineDefinition: ETLPipeline = {
  id: 'hunters-analytics-pipeline',
  stages: [
    {
      name: 'extract-hunters',
      type: 'extraction',
      source: 'github-api',
      target: 'staging.raw_hunters',
      schedule: '0 * * * *', // hourly
      retryPolicy: {
        maxAttempts: 3,
        backoffMs: 5000
      }
    },
    {
      name: 'extract-api-events',
      type: 'extraction',
      source: 'claude-proxy-logs',
      target: 'staging.raw_api_events',
      schedule: '*/5 * * * *', // every 5 minutes
      retryPolicy: {
        maxAttempts: 5,
        backoffMs: 2000
      }
    },
    {
      name: 'transform-hunters',
      type: 'transformation',
      source: 'staging.raw_hunters',
      target: 'analytics.hunters',
      schedule: '*/10 * * * *',
      retryPolicy: {
        maxAttempts: 3,
        backoffMs: 3000
      }
    },
    {
      name: 'enrich-api-events',
      type: 'transformation',
      source: 'staging.raw_api_events',
      target: 'analytics.api_events',
      schedule: '*/5 * * * *',
      retryPolicy: {
        maxAttempts: 3,
        backoffMs: 3000
      }
    },
    {
      name: 'aggregate-metrics',
      type: 'transformation',
      source: 'analytics.api_events',
      target: 'analytics.hourly_metrics',
      schedule: '5 * * * *', // 5 minutes past the hour
      retryPolicy: {
        maxAttempts: 2,
        backoffMs: 4000
      }
    },
    {
      name: 'generate-features',
      type: 'transformation',
      source: 'analytics.*',
      target: 'ml_features.hunter_features',
      schedule: '0 * * * *', // hourly
      retryPolicy: {
        maxAttempts: 2,
        backoffMs: 5000
      }
    }
  ],
  monitoring: {
    healthCheckInterval: 300000, // 5 minutes
    alertThreshold: 0.95 // alert if success rate < 95%
  }
};

export { PipelineStage, ETLPipeline, pipelineDefinition };
