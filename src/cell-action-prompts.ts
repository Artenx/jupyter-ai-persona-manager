/** Prompt builders for the Jupyter AI notebook cell actions. */

export type CellAction = 'explain' | 'debug' | 'comment';

/**
 * Select a Markdown fence longer than any backtick run in the cell source, so
 * a string literal containing triple backticks cannot terminate the code block.
 */
/**
 * Strip ANSI escape sequences (SGR color codes and other CSI sequences) that
 * Jupyter embeds in stored error tracebacks; the chat renders message bodies
 * as Markdown, where raw escape codes would show up as visible garbage.
 */
function stripAnsi(text: string): string {
  return text.replace(/\u001B\[[0-9;:?]*[A-Za-z]/g, '');
}

function codeFence(source: string): string {
  const runs = source.match(/`+/g) ?? [];
  const longestRun = runs.reduce(
    (longest, run) => Math.max(longest, run.length),
    0
  );
  return '`'.repeat(Math.max(3, longestRun + 1));
}

export function buildCellActionPrompt(
  action: CellAction,
  source: string,
  errorText: string | null
): string {
  const fence = codeFence(source);
  const codeBlock = `${fence}python\n${source}\n${fence}`;

  if (action === 'explain') {
    return [
      '请解释下面 Jupyter Notebook 当前代码单元格中的 Python 代码。',
      '用中文概述代码目的、主要步骤、关键变量以及输入和输出；不必逐行翻译。',
      '指出重要假设或潜在风险。不要执行代码，也不要修改任何单元格。',
      '',
      '当前单元格代码：',
      codeBlock
    ].join('\n');
  }

  if (action === 'comment') {
    return [
      '请为下面 Jupyter Notebook 当前代码单元格中的 Python 代码补充必要、准确、易懂的中文注释。',
      '重点说明代码块的目的、非显而易见的逻辑、关键变量和重要假设；不要给每一行机械地添加注释。',
      '保留代码的行为、结构和现有注释，只添加或完善注释；不要重构、优化、重命名变量或改变任何可执行代码。',
      '不要执行代码或直接修改 notebook。请仅返回包含注释后完整单元格代码的 Python 代码块，不要附加分析或 diff。',
      '',
      '当前单元格代码：',
      codeBlock
    ].join('\n');
  }

  const errorBlock = errorText
    ? `${codeFence(errorText)}\n${stripAnsi(errorText)}\n${codeFence(errorText)}`
    : '当前单元格没有保存的错误输出。请先静态检查潜在问题，并说明还需要哪些信息。';
  return [
    '请排查下面 Jupyter Notebook 当前代码单元格中的问题。',
    '结合错误追踪定位根因，说明原因，并给出尽量小的修复方案和可直接替换当前单元格的完整代码。',
    '不要执行代码或直接修改 notebook；只提供分析和建议。',
    '',
    '当前单元格代码：',
    codeBlock,
    '',
    '最近一次执行错误：',
    errorBlock
  ].join('\n');
}
