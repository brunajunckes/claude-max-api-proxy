/**
 * AIOX Panel Wrapper
 * TypeScript strict integration layer for AIOX visual components in Hermes CLI
 *
 * Reutiliza PanelRenderer e ObservabilityPanel do AIOX core
 * Fornece interface type-safe para CLI Hermes
 */

import chalk from 'chalk';
import { observabilityManager } from '../monitoring/observability.js';
import { cacheManager } from '../server/cache-middleware.js';

// ============================================================================
// TYPES
// ============================================================================

export interface PanelState {
  readonly mode: 'minimal' | 'detailed';
  readonly refreshRate: number;
  readonly width: number;
  readonly pipeline: PipelineState;
  readonly currentAgent: AgentState;
  readonly activeTerminals: TerminalState;
  readonly elapsed: ElapsedTimeState;
  readonly tradeoffs: TradeoffEntry[];
  readonly errors: ErrorEntry[];
  readonly nextSteps: string[];
}

export interface PipelineState {
  readonly stages: readonly string[];
  readonly currentStage: string | null;
  readonly storyProgress: string;
  readonly completedStages: readonly string[];
}

export interface AgentState {
  readonly id: string | null;
  readonly name: string | null;
  readonly task: string | null;
  readonly reason: string | null;
}

export interface TerminalState {
  readonly count: number;
  readonly list: readonly TerminalEntry[];
}

export interface TerminalEntry {
  readonly agent: string;
  readonly pid: number;
  readonly task: string;
}

export interface ElapsedTimeState {
  readonly storyStart: number | null;
  readonly sessionStart: number | null;
}

export interface TradeoffEntry {
  readonly choice: string;
  readonly selected: string;
  readonly reason: string;
}

export interface ErrorEntry {
  readonly message: string;
  readonly timestamp: number;
}

export interface PanelOptions {
  readonly width?: number;
  readonly refreshRate?: number;
  readonly mode?: 'minimal' | 'detailed';
}

// ============================================================================
// BOX DRAWING & STATUS INDICATORS
// ============================================================================

const BOX = {
  topLeft: '┌' as const,
  topRight: '┐' as const,
  bottomLeft: '└' as const,
  bottomRight: '┘' as const,
  horizontal: '─' as const,
  vertical: '│' as const,
  teeRight: '├' as const,
  teeLeft: '┤' as const,
} as const;

const STATUS = {
  completed: chalk.green('✓'),
  current: chalk.yellow('●'),
  pending: chalk.gray('○'),
  error: chalk.red('✗'),
  bullet: chalk.gray('•'),
} as const;

// ============================================================================
// PANEL RENDERER
// ============================================================================

export class AioxPanelRenderer {
  private readonly width: number;

  constructor(width: number = 60) {
    this.width = width;
  }

  private stripAnsi(str: string): string {
    // eslint-disable-next-line no-control-regex
    return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
  }

  private horizontalLine(width: number = this.width): string {
    return BOX.horizontal.repeat(Math.max(0, width - 2));
  }

  private topBorder(width: number = this.width): string {
    return chalk.cyan(`${BOX.topLeft}${this.horizontalLine(width)}${BOX.topRight}`);
  }

  private bottomBorder(width: number = this.width): string {
    return chalk.cyan(`${BOX.bottomLeft}${this.horizontalLine(width)}${BOX.bottomRight}`);
  }

  private separator(width: number = this.width): string {
    return chalk.cyan(`${BOX.teeRight}${this.horizontalLine(width)}${BOX.teeLeft}`);
  }

  private contentLine(content: string, width: number = this.width): string {
    const stripped = this.stripAnsi(content);
    const padding = Math.max(0, width - stripped.length - 4);
    const paddedContent = content + ' '.repeat(padding);
    return `${chalk.cyan(BOX.vertical)} ${paddedContent} ${chalk.cyan(BOX.vertical)}`;
  }

  private formatElapsedTime(elapsed: ElapsedTimeState): { story: string; session: string } {
    const now = Date.now();

    const formatDuration = (ms: number | null): string => {
      if (!ms || ms < 0) return '--';
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);

      if (hours > 0) {
        return `${hours}h${minutes % 60}m`;
      }
      if (minutes > 0) {
        return `${minutes}m${seconds % 60}s`;
      }
      return `${seconds}s`;
    };

    return {
      story: elapsed.storyStart ? formatDuration(now - elapsed.storyStart) : '--',
      session: elapsed.sessionStart ? formatDuration(now - elapsed.sessionStart) : '--',
    };
  }

  private renderPipeline(pipeline: PipelineState): string {
    const parts = pipeline.stages.map((stage) => {
      const isCompleted = pipeline.completedStages.includes(stage);
      const isCurrent = pipeline.currentStage === stage;

      if (stage === 'Story') {
        const progress = pipeline.storyProgress || '0/0';
        if (isCurrent) {
          return chalk.yellow(`[${progress}]`);
        }
        if (isCompleted) {
          return chalk.green(`[${progress} ${STATUS.completed}]`);
        }
        return chalk.gray(`[${progress}]`);
      }

      if (isCompleted) {
        return chalk.green(`[${stage} ${STATUS.completed}]`);
      }
      if (isCurrent) {
        return chalk.yellow(`[${stage} ${STATUS.current}]`);
      }
      return chalk.gray(`[${stage}]`);
    });

    return parts.join(chalk.gray(' → '));
  }

  renderMinimal(state: PanelState): string {
    const lines: string[] = [];
    const w = this.width;
    const elapsed = this.formatElapsedTime(state.elapsed);

    lines.push(this.topBorder(w));
    lines.push(this.contentLine(chalk.bold.cyan('🔧 Hermes Status'), w));
    lines.push(this.separator(w));

    const pipelineStr = `Pipeline: ${this.renderPipeline(state.pipeline)}`;
    lines.push(this.contentLine(pipelineStr, w));

    const agentId = state.currentAgent.id || '--';
    const agentTask = state.currentAgent.task || 'idle';
    lines.push(this.contentLine(`Current:  ${chalk.yellow(`[${agentId}]`)} ${agentTask}`, w));

    const termCount = state.activeTerminals.count;
    const termAgents = state.activeTerminals.list
      .slice(0, 3)
      .map((t) => t.agent)
      .join(', ');
    const termStr = termCount > 0 ? `${termCount} active (${termAgents})` : chalk.gray('none');
    lines.push(this.contentLine(`Terminals: ${termStr}`, w));

    lines.push(
      this.contentLine(
        `Elapsed:  ${chalk.cyan(elapsed.story)} (story) | ${chalk.cyan(elapsed.session)} (session)`,
        w
      )
    );

    if (state.errors.length > 0) {
      lines.push(this.separator(w));
      const errorMsg = state.errors[state.errors.length - 1]!.message;
      lines.push(this.contentLine(`${STATUS.error} ${chalk.red(errorMsg.slice(0, 50))}`, w));
    }

    lines.push(this.bottomBorder(w));
    return lines.join('\n') + '\n';
  }

  renderDetailed(state: PanelState): string {
    const lines: string[] = [];
    const w = this.width;
    const elapsed = this.formatElapsedTime(state.elapsed);

    lines.push(this.topBorder(w));
    lines.push(this.contentLine(chalk.bold.cyan('🔧 Hermes Status — Detailed'), w));
    lines.push(this.separator(w));

    lines.push(this.contentLine(chalk.bold('Pipeline:'), w));
    lines.push(this.contentLine(`  ${this.renderPipeline(state.pipeline)}`, w));
    lines.push(this.contentLine('', w));

    lines.push(this.contentLine(chalk.bold('Current Agent:'), w));
    const agentId = state.currentAgent.id || '--';
    const agentName = state.currentAgent.name || '';
    const agentTask = state.currentAgent.task || 'idle';
    lines.push(
      this.contentLine(
        `  ${chalk.yellow(agentId)} ${agentName ? `(${agentName})` : ''} ${agentTask}`,
        w
      )
    );
    if (state.currentAgent.reason) {
      lines.push(
        this.contentLine(
          `  ${chalk.gray(`Why ${agentId}?`)} ${state.currentAgent.reason}`,
          w
        )
      );
    }
    lines.push(this.contentLine('', w));

    lines.push(this.contentLine(chalk.bold('Active Terminals:'), w));
    if (state.activeTerminals.list.length > 0) {
      state.activeTerminals.list.slice(0, 4).forEach((terminal) => {
        const pidStr = terminal.pid ? `(PID ${terminal.pid})` : '';
        lines.push(
          this.contentLine(
            `  ${STATUS.bullet} ${chalk.yellow(terminal.agent.padEnd(12))} ${chalk.gray(pidStr)} — ${terminal.task}`,
            w
          )
        );
      });
    } else {
      lines.push(this.contentLine(`  ${chalk.gray('No active terminals')}`, w));
    }
    lines.push(this.contentLine('', w));

    lines.push(this.contentLine(chalk.bold('Elapsed:'), w));
    lines.push(
      this.contentLine(
        `  Story: ${chalk.cyan(elapsed.story)} | Session: ${chalk.cyan(elapsed.session)}`,
        w
      )
    );
    lines.push(this.contentLine('', w));

    if (state.tradeoffs.length > 0) {
      lines.push(this.contentLine(chalk.bold('Trade-offs:'), w));
      state.tradeoffs.slice(-3).forEach((tradeoff) => {
        lines.push(
          this.contentLine(
            `  ${STATUS.bullet} ${tradeoff.choice}: ${chalk.green(tradeoff.selected)} (${tradeoff.reason})`,
            w
          )
        );
      });
      lines.push(this.contentLine('', w));
    }

    if (state.nextSteps.length > 0) {
      lines.push(this.contentLine(chalk.bold('Next Steps:'), w));
      state.nextSteps.slice(0, 3).forEach((step, i) => {
        lines.push(this.contentLine(`  ${i + 1}. ${step}`, w));
      });
    }

    if (state.errors.length > 0) {
      lines.push(this.separator(w));
      lines.push(this.contentLine(chalk.bold.red('Errors:'), w));
      state.errors.slice(-2).forEach((error) => {
        lines.push(this.contentLine(`  ${STATUS.error} ${chalk.red(error.message.slice(0, 45))}`, w));
      });
    }

    lines.push(this.bottomBorder(w));
    return lines.join('\n') + '\n';
  }
}

// ============================================================================
// OBSERVABILITY PANEL
// ============================================================================

export class AioxObservabilityPanel {
  private state: PanelState;
  private renderer: AioxPanelRenderer;
  private refreshInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(options: PanelOptions = {}) {
    const width = options.width ?? 60;
    const refreshRate = options.refreshRate ?? 1000;
    const mode = options.mode ?? 'minimal';

    this.renderer = new AioxPanelRenderer(width);
    this.state = this.createDefaultState(width, refreshRate, mode);
  }

  private createDefaultState(
    width: number,
    refreshRate: number,
    mode: 'minimal' | 'detailed'
  ): PanelState {
    return {
      mode,
      refreshRate,
      width,
      pipeline: {
        stages: ['PRD', 'Epic', 'Story', 'Dev', 'QA', 'Push'] as const,
        currentStage: null,
        storyProgress: '0/0',
        completedStages: [],
      },
      currentAgent: {
        id: null,
        name: null,
        task: null,
        reason: null,
      },
      activeTerminals: {
        count: 0,
        list: [],
      },
      elapsed: {
        storyStart: null,
        sessionStart: Date.now(),
      },
      tradeoffs: [],
      errors: [],
      nextSteps: [],
    };
  }

  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.render();

    this.refreshInterval = setInterval(() => {
      this.render();
    }, this.state.refreshRate);
  }

  stop(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    this.isRunning = false;
  }

  private render(): void {
    const output =
      this.state.mode === 'detailed' ? this.renderer.renderDetailed(this.state) : this.renderer.renderMinimal(this.state);

    this.clearPanel();
    process.stdout.write(output);
  }

  private clearPanel(): void {
    const lineCount = this.state.mode === 'detailed' ? 24 : 8;
    process.stdout.write(`\x1B[${lineCount}A\x1B[0J`);
  }

  setCurrentAgent(id: string, name: string, task: string, reason?: string): void {
    this.state = {
      ...this.state,
      currentAgent: {
        id,
        name,
        task,
        reason: reason ?? null,
      },
    };
  }

  setPipelineStage(stage: string, storyProgress?: string): void {
    this.state = {
      ...this.state,
      pipeline: {
        ...this.state.pipeline,
        currentStage: stage,
        storyProgress: storyProgress ?? this.state.pipeline.storyProgress,
      },
    };
  }

  completePipelineStage(stage: string): void {
    if (!this.state.pipeline.completedStages.includes(stage)) {
      this.state = {
        ...this.state,
        pipeline: {
          ...this.state.pipeline,
          completedStages: [...this.state.pipeline.completedStages, stage],
        },
      };
    }
  }

  addTerminal(agent: string, pid: number, task: string): void {
    const newTerminal: TerminalEntry = { agent, pid, task };
    this.state = {
      ...this.state,
      activeTerminals: {
        count: this.state.activeTerminals.count + 1,
        list: [...this.state.activeTerminals.list, newTerminal],
      },
    };
  }

  removeTerminal(pid: number): void {
    const filtered = this.state.activeTerminals.list.filter((t) => t.pid !== pid);
    this.state = {
      ...this.state,
      activeTerminals: {
        count: filtered.length,
        list: filtered,
      },
    };
  }

  startStoryTimer(): void {
    this.state = {
      ...this.state,
      elapsed: {
        ...this.state.elapsed,
        storyStart: Date.now(),
      },
    };
  }

  addTradeoff(choice: string, selected: string, reason: string): void {
    this.state = {
      ...this.state,
      tradeoffs: [...this.state.tradeoffs, { choice, selected, reason }],
    };
  }

  addError(message: string): void {
    this.state = {
      ...this.state,
      errors: [...this.state.errors, { message, timestamp: Date.now() }],
    };
  }

  clearErrors(): void {
    this.state = {
      ...this.state,
      errors: [],
    };
  }

  setNextSteps(steps: readonly string[]): void {
    this.state = {
      ...this.state,
      nextSteps: [...steps],
    };
  }

  toggleMode(): 'minimal' | 'detailed' {
    const newMode: 'minimal' | 'detailed' = this.state.mode === 'minimal' ? 'detailed' : 'minimal';
    this.state = {
      ...this.state,
      mode: newMode,
    };
    return newMode;
  }

  setMode(mode: 'minimal' | 'detailed'): void {
    this.state = {
      ...this.state,
      mode,
    };
  }

  getElapsedTime(): { story: string; session: string } {
    const now = Date.now();

    const formatDuration = (ms: number | null): string => {
      if (!ms || ms < 0) return '0s';
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);

      if (hours > 0) {
        return `${hours}h${minutes % 60}m`;
      }
      if (minutes > 0) {
        return `${minutes}m${seconds % 60}s`;
      }
      return `${seconds}s`;
    };

    return {
      story: this.state.elapsed.storyStart
        ? formatDuration(now - this.state.elapsed.storyStart)
        : '--',
      session: this.state.elapsed.sessionStart
        ? formatDuration(now - this.state.elapsed.sessionStart)
        : '--',
    };
  }

  getState(): Readonly<PanelState> {
    return Object.freeze({ ...this.state });
  }

  renderOnce(): string {
    return this.state.mode === 'detailed'
      ? this.renderer.renderDetailed(this.state)
      : this.renderer.renderMinimal(this.state);
  }
}

// ============================================================================
// METRICS PANEL (integração com observabilityManager)
// ============================================================================

export class AioxMetricsPanel {
  private renderer: AioxPanelRenderer;

  constructor(width: number = 80) {
    this.renderer = new AioxPanelRenderer(width);
  }

  renderMetricsBox(port: number, host: string = '127.0.0.1'): string {
    const snapshot = observabilityManager.getSnapshot();
    const { memory, cpu, requests, latency } = snapshot;
    const cacheStats = cacheManager.stats();

    const lines: string[] = [];
    const line = '─'.repeat(80);

    lines.push(`┌${line}┐`);
    lines.push(`│ ${chalk.bold('Hermes Metrics Dashboard')}${' '.repeat(52)}│`);
    lines.push(`├${line}┤`);
    lines.push(
      `│ ${chalk.cyan('Server')}: http://${host}:${port}${' '.repeat(60 - host.length - String(port).length)}│`
    );
    lines.push(
      `│ ${chalk.cyan('Endpoint')}: http://${host}:${port}/v1/chat/completions${' '.repeat(42 - host.length - String(port).length)}│`
    );
    lines.push(`├${line}┤`);

    const memPercent = Math.round((memory.heap_used_mb / memory.heap_total_mb) * 100);
    lines.push(
      `│ ${chalk.yellow('Memory')}: ${memory.heap_used_mb}/${memory.heap_total_mb}MB (${memPercent}%)${' '.repeat(55 - String(memory.heap_used_mb).length - String(memory.heap_total_mb).length)}│`
    );
    lines.push(
      `│ ${chalk.yellow('CPU')}: ${cpu.percent.toFixed(1)}%  (User: ${cpu.user_ms}ms, System: ${cpu.system_ms}ms)${' '.repeat(45 - String(cpu.percent).length - String(cpu.user_ms).length - String(cpu.system_ms).length)}│`
    );
    lines.push(
      `│ ${chalk.yellow('Requests')}: ${requests.total} total, ${requests.active} active, ${requests.errors} errors${' '.repeat(52 - String(requests.total).length - String(requests.active).length - String(requests.errors).length)}│`
    );
    lines.push(
      `│ ${chalk.yellow('Latency')}: p50=${latency.p50.toFixed(0)}ms, p95=${latency.p95.toFixed(0)}ms, p99=${latency.p99.toFixed(0)}ms${' '.repeat(40 - String(latency.p50).length - String(latency.p95).length - String(latency.p99).length)}│`
    );
    lines.push(
      `│ ${chalk.yellow('Cache')}: ${cacheStats.hitRate.toFixed(1)}% hit rate (${cacheStats.hits}/${cacheStats.totalRequests})${' '.repeat(50 - String(cacheStats.hitRate).length - String(cacheStats.hits).length - String(cacheStats.totalRequests).length)}│`
    );
    lines.push(`├${line}┤`);
    lines.push(`│ ${chalk.gray('Press Ctrl+C to stop')}${' '.repeat(57)}│`);
    lines.push(`└${line}┘`);

    return lines.join('\n');
  }

  renderMetricsFooter(): string {
    const snapshot = observabilityManager.getSnapshot();
    const { memory, cpu, requests, latency } = snapshot;
    const cacheStats = cacheManager.stats();

    const memPercent = Math.round((memory.heap_used_mb / memory.heap_total_mb) * 100);
    const parts = [
      `${chalk.cyan('MEM')}: ${memory.heap_used_mb}/${memory.heap_total_mb}MB (${memPercent}%)`,
      `${chalk.cyan('CPU')}: ${cpu.percent.toFixed(1)}%`,
      `${chalk.cyan('REQ')}: ${requests.total}(${requests.active} active)`,
      `${chalk.cyan('ERR')}: ${requests.errors}`,
      `${chalk.cyan('LAT')}: p50=${latency.p50.toFixed(0)}ms p95=${latency.p95.toFixed(0)}ms`,
      `${chalk.cyan('CACHE')}: ${cacheStats.hitRate.toFixed(1)}%`,
    ];

    return `[${new Date().toLocaleTimeString()}] ${parts.join(' | ')}`;
  }
}

// ============================================================================
// FACTORY & EXPORTS
// ============================================================================

export function createAioxPanel(options?: PanelOptions): AioxObservabilityPanel {
  return new AioxObservabilityPanel(options);
}

export function createAioxMetricsPanel(width?: number): AioxMetricsPanel {
  return new AioxMetricsPanel(width);
}

export const aioxPanelExports = {
  AioxPanelRenderer,
  AioxObservabilityPanel,
  AioxMetricsPanel,
  createAioxPanel,
  createAioxMetricsPanel,
  BOX,
  STATUS,
} as const;
