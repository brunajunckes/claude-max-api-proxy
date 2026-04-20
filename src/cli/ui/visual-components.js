/**
 * Visual Components Module
 *
 * AIOX-style UI components para terminal
 * Exporta componentes reutilizáveis de box, tabelas, painéis
 *
 * @module src/cli/ui/visual-components
 * @version 1.0.0
 */

import chalk from 'chalk';

/**
 * Box drawing characters (Unicode)
 */
export const BOX = {
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
 * Status indicators com cores
 */
export const STATUS = {
  completed: chalk.green('✓'),
  current: chalk.yellow('●'),
  pending: chalk.gray('○'),
  error: chalk.red('✗'),
  warning: chalk.yellow('⚠'),
  info: chalk.blue('ℹ'),
  bullet: chalk.gray('•'),
  arrow: chalk.cyan('→'),
  check: chalk.green('✔'),
  cross: chalk.red('✕'),
};

/**
 * Color palette
 */
export const COLORS = {
  primary: chalk.cyan,
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  info: chalk.blue,
  muted: chalk.gray,
};

/**
 * Create box border com título
 *
 * @param {string} title - Título da box
 * @param {number} width - Largura total
 * @returns {string} Top border com título
 */
export function createBox(title, width = 70) {
  const titleStr = ` ${title} `;
  const titleLen = titleStr.length;
  const leftPad = Math.floor((width - titleLen) / 2);
  const rightPad = width - titleLen - leftPad;

  const topLine = BOX.topLeft +
    BOX.horizontal.repeat(Math.max(0, leftPad - 1)) +
    titleStr +
    BOX.horizontal.repeat(Math.max(0, rightPad - 1)) +
    BOX.topRight;

  return COLORS.primary(topLine);
}

/**
 * Create horizontal separator
 *
 * @param {number} width - Largura
 * @returns {string} Linha horizontal
 */
export function horizontalLine(width = 70) {
  return COLORS.primary(BOX.teeRight + BOX.horizontal.repeat(Math.max(0, width - 2)) + BOX.teeLeft);
}

/**
 * Create content line com padding
 *
 * @param {string} text - Conteúdo
 * @param {number} width - Largura total
 * @returns {string} Linha com borders
 */
export function contentLine(text, width = 70) {
  const padding = Math.max(0, width - text.length - 4);
  return COLORS.primary(BOX.vertical) + ' ' + text + ' '.repeat(padding) + COLORS.primary(BOX.vertical);
}

/**
 * Create footer box
 *
 * @param {number} width - Largura
 * @returns {string} Bottom border
 */
export function createFooter(width = 70) {
  return COLORS.primary(BOX.bottomLeft + BOX.horizontal.repeat(Math.max(0, width - 2)) + BOX.bottomRight);
}

/**
 * Create header banner
 *
 * @param {string} title - Título
 * @param {string} subtitle - Subtitle opcional
 * @param {number} width - Largura
 * @returns {string} Header formatado
 */
export function createHeader(title, subtitle = '', width = 70) {
  let output = '\n';
  output += createBox(title, width) + '\n';

  if (subtitle) {
    output += contentLine(COLORS.muted(subtitle), width) + '\n';
  }

  output += createFooter(width) + '\n\n';

  return output;
}

/**
 * Create table row
 *
 * @param {string} col1 - Coluna 1
 * @param {string} col2 - Coluna 2
 * @param {number} col1Width - Largura coluna 1
 * @param {number} totalWidth - Largura total
 * @returns {string} Linha da tabela
 */
export function tableRow(col1, col2, col1Width = 30, totalWidth = 70) {
  const col2Width = totalWidth - col1Width - 5;
  const paddedCol1 = col1.padEnd(col1Width);
  const paddedCol2 = col2.slice(0, col2Width).padEnd(col2Width);

  return contentLine(`${paddedCol1} ${paddedCol2}`, totalWidth);
}

/**
 * Create agent list
 *
 * @param {Array<string>} agents - Array de nomes de agentes
 * @param {number} width - Largura
 * @returns {string} Tabela formatada
 */
export function createAgentsList(agents, width = 70) {
  let output = createBox('AGENTES DISPONÍVEIS', width) + '\n';
  output += horizontalLine(width) + '\n';

  agents.forEach(agent => {
    const agentStr = `  ${STATUS.bullet} @${agent}`;
    output += contentLine(agentStr, width) + '\n';
  });

  output += createFooter(width) + '\n\n';

  return output;
}

/**
 * Create command help
 *
 * @param {Array} commands - Array de {name, desc}
 * @param {number} width - Largura
 * @returns {string} Tabela de comandos
 */
export function createCommandsHelp(commands, width = 70) {
  let output = createBox('COMANDOS', width) + '\n';
  output += horizontalLine(width) + '\n';

  commands.forEach(({ name, desc }) => {
    const cmdPad = name.padEnd(40);
    output += contentLine(`${cmdPad} ${desc}`, width) + '\n';
  });

  output += createFooter(width) + '\n\n';

  return output;
}

/**
 * Create status panel
 *
 * @param {Object} data - {status, message, details}
 * @param {number} width - Largura
 * @returns {string} Panel formatado
 */
export function createStatusPanel(data, width = 70) {
  const statusIcon = data.status === 'success'
    ? STATUS.completed
    : data.status === 'error'
      ? STATUS.error
      : STATUS.info;

  let output = createBox(data.title || 'STATUS', width) + '\n';
  output += contentLine(`${statusIcon} ${data.message}`, width) + '\n';

  if (data.details) {
    output += horizontalLine(width) + '\n';
    if (Array.isArray(data.details)) {
      data.details.forEach(detail => {
        output += contentLine(`  ${detail}`, width) + '\n';
      });
    } else {
      output += contentLine(`  ${data.details}`, width) + '\n';
    }
  }

  output += createFooter(width) + '\n\n';

  return output;
}

export default {
  BOX,
  STATUS,
  COLORS,
  createBox,
  horizontalLine,
  contentLine,
  createFooter,
  createHeader,
  tableRow,
  createAgentsList,
  createCommandsHelp,
  createStatusPanel,
};
