#!/usr/bin/env node

/**
 * HERMES CLI - AIOX Visual UI
 *
 * Full-stack CLI with AIOX design patterns + visual components
 * Mantém Ollama como base, integra UI/UX do AIOX
 *
 * @version 2.0.0
 * @ui-system AIOX-style panels, box-drawing, status indicators
 */

import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const AIOX_CORE = path.join(ROOT, '.aiox-core');

/**
 * Box drawing characters (AIOX style)
 */
const BOX = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '─',
  vertical: '│',
  teeRight: '├',
  teeLeft: '┤',
  cross: '┼',
};

/**
 * Status indicators
 */
const STATUS = {
  completed: chalk.green('✓'),
  current: chalk.yellow('●'),
  pending: chalk.gray('○'),
  error: chalk.red('✗'),
  bullet: chalk.gray('•'),
  arrow: chalk.cyan('→'),
};

/**
 * Create box border
 */
function createBox(title, width = 70) {
  const titleStr = ` ${title} `;
  const titleLen = titleStr.length;
  const leftPad = Math.floor((width - titleLen) / 2);
  const rightPad = width - titleLen - leftPad;

  const topLine = BOX.topLeft +
    BOX.horizontal.repeat(leftPad - 1) +
    titleStr +
    BOX.horizontal.repeat(rightPad - 1) +
    BOX.topRight;

  return chalk.cyan(topLine);
}

/**
 * Create horizontal line
 */
function horizontalLine(width = 70) {
  return chalk.cyan(BOX.teeRight + BOX.horizontal.repeat(width - 2) + BOX.teeLeft);
}

/**
 * Create content line with padding
 */
function contentLine(text, width = 70) {
  const padding = Math.max(0, width - text.length - 4);
  return chalk.cyan(BOX.vertical) + ' ' + text + ' '.repeat(padding) + chalk.cyan(BOX.vertical);
}

/**
 * Create footer
 */
function createFooter(width = 70) {
  return chalk.cyan(BOX.bottomLeft + BOX.horizontal.repeat(width - 2) + BOX.bottomRight);
}

/**
 * Show header banner
 */
function showHeader() {
  const width = 70;
  console.log('');
  console.log(createBox('HERMES - AIOX CLI', width));
  console.log(contentLine(chalk.bold('AI-Powered Development Framework'), width));
  console.log(contentLine('Ollama • AIOX Patterns • Story-Driven', width));
  console.log(createFooter(width));
  console.log('');
}

/**
 * Show agents list in table format
 */
function showAgentsTable(agents) {
  const width = 70;
  console.log('');
  console.log(createBox('AGENTES DISPONÍVEIS', width));
  console.log(horizontalLine(width));

  agents.forEach(agent => {
    const agentStr = `  ${STATUS.bullet} @${agent}`;
    console.log(contentLine(agentStr, width));
  });

  console.log(createFooter(width));
  console.log('');
}

/**
 * List available agents
 */
function listAgents() {
  const agentsDir = path.join(AIOX_CORE, 'development', 'agents');
  try {
    const files = fs.readdirSync(agentsDir);
    return files
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Show agent content
 */
function showAgent(agentName) {
  const agentFile = path.join(AIOX_CORE, 'development', 'agents', `${agentName}.md`);

  if (!fs.existsSync(agentFile)) {
    console.error(chalk.red(`\n✗ Agente '@${agentName}' não encontrado\n`));
    const agents = listAgents();
    if (agents.length > 0) {
      showAgentsTable(agents);
    }
    process.exit(1);
  }

  const content = fs.readFileSync(agentFile, 'utf8');
  console.log('\n');
  console.log(content);
}

/**
 * Show constitution
 */
function showConstitution() {
  const constFile = path.join(AIOX_CORE, 'constitution.md');
  if (fs.existsSync(constFile)) {
    const content = fs.readFileSync(constFile, 'utf8');
    console.log('\n');
    console.log(content);
  }
}

/**
 * Show help
 */
function showHelp() {
  showHeader();
  const agents = listAgents();

  const width = 70;
  console.log(createBox('COMANDOS', width));
  console.log(contentLine('Agentes:', width));
  console.log(horizontalLine(width));

  agents.slice(0, 5).forEach(agent => {
    const cmd = `  npm run hermes ${agent}`.padEnd(40);
    const desc = `Ativar agente @${agent}`;
    console.log(contentLine(`${cmd} ${desc}`, width));
  });

  console.log(horizontalLine(width));
  console.log(contentLine('  npm run hermes list              Listar agentes', width));
  console.log(contentLine('  npm run hermes const             Ver constituição', width));
  console.log(contentLine('  npm run hermes help              Este menu', width));
  console.log(createFooter(width));
  console.log('');
}

/**
 * Main program
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    showHelp();
  } else if (command === 'list' || command === 'ls') {
    showHeader();
    showAgentsTable(listAgents());
  } else if (command === 'const' || command === 'constitution') {
    showConstitution();
  } else {
    // Assume it's an agent name
    showAgent(command);
  }
}

main().catch(error => {
  console.error(chalk.red(`\n✗ Erro: ${error.message}\n`));
  process.exit(1);
});
