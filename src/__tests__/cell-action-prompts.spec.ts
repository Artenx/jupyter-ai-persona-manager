import { buildCellActionPrompt } from '../cell-action-prompts';

describe('buildCellActionPrompt', () => {
  it('builds an explanation request with the active cell source', () => {
    const prompt = buildCellActionPrompt(
      'explain',
      'total = price * count',
      null
    );

    expect(prompt).toContain('请解释');
    expect(prompt).toContain('```python\ntotal = price * count\n```');
    expect(prompt).toContain('不要执行代码');
  });

  it('includes the most recent traceback in a debug request', () => {
    const prompt = buildCellActionPrompt(
      'debug',
      'result = values[5]',
      'IndexError: list index out of range\nTraceback (most recent call last): ...'
    );

    expect(prompt).toContain('IndexError: list index out of range');
    expect(prompt).toContain('result = values[5]');
    expect(prompt).toContain('可直接替换当前单元格');
  });

  it('uses a longer fence when the code contains triple backticks', () => {
    const source = 'markdown = "```python"';
    const prompt = buildCellActionPrompt('explain', source, null);

    expect(prompt).toContain('````python\nmarkdown = "```python"\n````');
  });

  it('asks for static review when the cell has no saved traceback', () => {
    const prompt = buildCellActionPrompt('debug', 'x = y + 1', null);

    expect(prompt).toContain('当前单元格没有保存的错误输出');
  });
});
