/**
 * AIOX Panel Wrapper Tests
 * Unit tests para type-safe AIOX integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AioxPanelRenderer,
  AioxObservabilityPanel,
  AioxMetricsPanel,
  createAioxPanel,
  createAioxMetricsPanel,
} from './aiox-panel-wrapper.js';

describe('AioxPanelRenderer', () => {
  let renderer: AioxPanelRenderer;

  beforeEach(() => {
    renderer = new AioxPanelRenderer(60);
  });

  it('should render minimal panel', () => {
    const state = {
      mode: 'minimal' as const,
      refreshRate: 1000,
      width: 60,
      pipeline: {
        stages: ['PRD', 'Epic', 'Story', 'Dev', 'QA', 'Push'] as const,
        currentStage: 'Dev',
        storyProgress: '3/8',
        completedStages: ['PRD', 'Epic'],
      },
      currentAgent: {
        id: '@dev',
        name: 'Dex',
        task: 'implementing cache',
        reason: null,
      },
      activeTerminals: {
        count: 1,
        list: [{ agent: '@dev', pid: 1234, task: 'npm run build' }],
      },
      elapsed: {
        storyStart: Date.now() - 60000,
        sessionStart: Date.now() - 300000,
      },
      tradeoffs: [],
      errors: [],
      nextSteps: [],
    };

    const output = renderer.renderMinimal(state);
    expect(output).toContain('Hermes Status');
    expect(output).toContain('Pipeline');
    expect(output).toContain('@dev');
    expect(output).toContain('1 active');
  });

  it('should render detailed panel', () => {
    const state = {
      mode: 'detailed' as const,
      refreshRate: 1000,
      width: 60,
      pipeline: {
        stages: ['PRD', 'Epic', 'Story', 'Dev', 'QA', 'Push'] as const,
        currentStage: 'Story',
        storyProgress: '5/10',
        completedStages: ['PRD', 'Epic'],
      },
      currentAgent: {
        id: '@dev',
        name: 'Dex',
        task: 'code implementation',
        reason: 'Selected by auto-assignment logic',
      },
      activeTerminals: {
        count: 2,
        list: [
          { agent: '@dev', pid: 1234, task: 'build' },
          { agent: '@qa', pid: 5678, task: 'test' },
        ],
      },
      elapsed: {
        storyStart: Date.now() - 120000,
        sessionStart: Date.now() - 600000,
      },
      tradeoffs: [
        {
          choice: 'Cache Strategy',
          selected: 'Redis',
          reason: 'Better performance for distributed systems',
        },
      ],
      errors: [],
      nextSteps: ['Run tests', 'Push to main', 'Deploy to staging'],
    };

    const output = renderer.renderDetailed(state);
    expect(output).toContain('Detailed');
    expect(output).toContain('Current Agent');
    expect(output).toContain('Trade-offs');
    expect(output).toContain('Next Steps');
    expect(output).toContain('Redis');
  });

  it('should format elapsed time correctly', () => {
    const now = Date.now();
    const state = {
      mode: 'minimal' as const,
      refreshRate: 1000,
      width: 60,
      pipeline: {
        stages: ['PRD', 'Epic', 'Story', 'Dev', 'QA', 'Push'] as const,
        currentStage: null,
        storyProgress: '0/0',
        completedStages: [],
      },
      currentAgent: { id: null, name: null, task: null, reason: null },
      activeTerminals: { count: 0, list: [] },
      elapsed: {
        storyStart: now - 65000,
        sessionStart: now - 3725000,
      },
      tradeoffs: [],
      errors: [],
      nextSteps: [],
    };

    const output = renderer.renderMinimal(state);
    expect(output).toMatch(/1m[0-9]+s/); // 1 minute ~5 seconds
    expect(output).toMatch(/1h[0-9]+m/); // ~1h 2m
  });

  it('should handle errors display', () => {
    const state = {
      mode: 'minimal' as const,
      refreshRate: 1000,
      width: 60,
      pipeline: {
        stages: ['PRD', 'Epic', 'Story', 'Dev', 'QA', 'Push'] as const,
        currentStage: null,
        storyProgress: '0/0',
        completedStages: [],
      },
      currentAgent: { id: null, name: null, task: null, reason: null },
      activeTerminals: { count: 0, list: [] },
      elapsed: {
        storyStart: null,
        sessionStart: Date.now(),
      },
      tradeoffs: [],
      errors: [
        { message: 'Connection timeout after 30 seconds', timestamp: Date.now() },
        { message: 'Fallback to cache failed', timestamp: Date.now() },
      ],
      nextSteps: [],
    };

    const output = renderer.renderMinimal(state);
    expect(output).toContain('Connection timeout');
  });
});

describe('AioxObservabilityPanel', () => {
  let panel: AioxObservabilityPanel;

  beforeEach(() => {
    panel = new AioxObservabilityPanel({ width: 60, mode: 'minimal' });
  });

  afterEach(() => {
    panel.stop();
  });

  it('should create panel with default state', () => {
    const state = panel.getState();
    expect(state.mode).toBe('minimal');
    expect(state.currentAgent.id).toBeNull();
    expect(state.activeTerminals.count).toBe(0);
  });

  it('should set current agent', () => {
    panel.setCurrentAgent('@dev', 'Dex', 'implementing feature', 'Auto-selected');
    const state = panel.getState();
    expect(state.currentAgent.id).toBe('@dev');
    expect(state.currentAgent.name).toBe('Dex');
    expect(state.currentAgent.reason).toBe('Auto-selected');
  });

  it('should manage pipeline stages', () => {
    panel.setPipelineStage('Dev', '3/8');
    expect(panel.getState().pipeline.currentStage).toBe('Dev');
    expect(panel.getState().pipeline.storyProgress).toBe('3/8');

    panel.completePipelineStage('Dev');
    expect(panel.getState().pipeline.completedStages).toContain('Dev');
  });

  it('should manage terminals', () => {
    panel.addTerminal('@dev', 1234, 'npm run build');
    expect(panel.getState().activeTerminals.count).toBe(1);
    expect(panel.getState().activeTerminals.list[0]?.pid).toBe(1234);

    panel.removeTerminal(1234);
    expect(panel.getState().activeTerminals.count).toBe(0);
  });

  it('should track story timer', () => {
    const before = Date.now();
    panel.startStoryTimer();
    const state = panel.getState();
    const after = Date.now();

    expect(state.elapsed.storyStart).toBeGreaterThanOrEqual(before);
    expect(state.elapsed.storyStart).toBeLessThanOrEqual(after);
  });

  it('should add tradeoffs', () => {
    panel.addTradeoff('Auth Method', 'JWT', 'Stateless, better for microservices');
    const state = panel.getState();
    expect(state.tradeoffs).toHaveLength(1);
    expect(state.tradeoffs[0]!.selected).toBe('JWT');
  });

  it('should manage errors', () => {
    panel.addError('Timeout after 30s');
    expect(panel.getState().errors).toHaveLength(1);

    panel.addError('Fallback failed');
    expect(panel.getState().errors).toHaveLength(2);

    panel.clearErrors();
    expect(panel.getState().errors).toHaveLength(0);
  });

  it('should set next steps', () => {
    const steps = ['Run tests', 'Push changes', 'Deploy'] as const;
    panel.setNextSteps(steps);
    expect(panel.getState().nextSteps).toEqual(['Run tests', 'Push changes', 'Deploy']);
  });

  it('should toggle between modes', () => {
    expect(panel.getState().mode).toBe('minimal');
    const newMode = panel.toggleMode();
    expect(newMode).toBe('detailed');
    expect(panel.getState().mode).toBe('detailed');
  });

  it('should render once without starting loop', () => {
    panel.setCurrentAgent('@dev', 'Dex', 'testing');
    const output = panel.renderOnce();
    expect(output).toContain('Hermes Status');
    expect(output).toContain('@dev');
  });

  it('should calculate elapsed times', () => {
    const now = Date.now();
    panel = new AioxObservabilityPanel({
      width: 60,
      mode: 'minimal',
    });

    // Manually set times for predictable testing
    const elapsed = panel.getElapsedTime();
    expect(elapsed.story).toBe('--');
    expect(elapsed.session).not.toBe('--');
  });

  it('should freeze state on getState', () => {
    const state = panel.getState();
    expect(() => {
      (state as any).mode = 'detailed';
    }).toThrow();
  });
});

describe('AioxMetricsPanel', () => {
  let panel: AioxMetricsPanel;

  beforeEach(() => {
    panel = new AioxMetricsPanel(80);
  });

  it('should render metrics box', () => {
    const output = panel.renderMetricsBox(3000, 'localhost');
    expect(output).toContain('Hermes Metrics Dashboard');
    expect(output).toContain('localhost:3000');
    expect(output).toContain('Memory');
    expect(output).toContain('CPU');
    expect(output).toContain('Requests');
  });

  it('should render metrics footer', () => {
    const output = panel.renderMetricsFooter();
    expect(output).toMatch(/\d{2}:\d{2}:\d{2}/);
    expect(output).toContain('MEM');
    expect(output).toContain('CPU');
    expect(output).toContain('REQ');
  });

  it('should use default host', () => {
    const output = panel.renderMetricsBox(3000);
    expect(output).toContain('127.0.0.1:3000');
  });
});

describe('Factory Functions', () => {
  it('should create panel with factory', () => {
    const panel = createAioxPanel({ width: 70, mode: 'detailed' });
    const state = panel.getState();
    expect(state.width).toBe(70);
    expect(state.mode).toBe('detailed');
  });

  it('should create metrics panel with factory', () => {
    const panel = createAioxMetricsPanel(80);
    const output = panel.renderMetricsBox(3000);
    expect(output).toContain('Dashboard');
  });
});

describe('Type Safety', () => {
  it('should have correct type signatures', () => {
    const panel = createAioxPanel();
    const state = panel.getState();

    // These should compile without errors
    const mode: 'minimal' | 'detailed' = state.mode;
    const agentId: string | null = state.currentAgent.id;
    const termCount: number = state.activeTerminals.count;

    expect(mode).toBeDefined();
    expect(agentId).toBeDefined();
    expect(termCount).toBeDefined();
  });
});
