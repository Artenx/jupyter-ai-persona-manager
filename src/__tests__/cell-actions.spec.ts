jest.mock('@jupyterlab/ui-components', () => ({
  LabIcon: class {
    constructor(_options: unknown) {}
    bindprops(_props: unknown) {
      return {};
    }
  }
}));
jest.mock('@jupyterlab/apputils', () => ({
  Notification: { emit: jest.fn() }
}));
jest.mock('@jupyterlab/notebook', () => ({ INotebookTracker: {} }));
jest.mock('@jupyterlab/settingregistry', () => ({ ISettingRegistry: {} }));

import { Signal } from '@lumino/signaling';
import cellActionsPlugin from '../cell-actions';

describe('cell action toolbar visibility', () => {
  it('shows code-cell actions even if the chat command registers later', () => {
    const commands = new Map<string, any>();
    const commandRegistry = {
      addCommand: jest.fn((id, options) => commands.set(id, options)),
      hasCommand: jest.fn(() => false),
      notifyCommandChanged: jest.fn(),
      execute: jest.fn()
    };
    const tracker: any = {
      activeCell: { model: { type: 'code' } }
    };
    tracker.activeCellChanged = new Signal(tracker);
    tracker.currentChanged = new Signal(tracker);

    const settingRegistry = { load: jest.fn(() => Promise.resolve({})) };
    cellActionsPlugin.activate!(
      { commands: commandRegistry } as any,
      tracker,
      settingRegistry as any
    );

    expect(settingRegistry.load).toHaveBeenCalledWith(
      '@jupyter-ai/persona-manager:toolbar-buttons'
    );

    expect(
      commands.get('toolbar-button:jupyter-ai-explain-cell').isVisible()
    ).toBe(true);
    expect(
      commands.get('toolbar-button:jupyter-ai-debug-cell').isVisible()
    ).toBe(true);
    expect(
      commands.get('toolbar-button:jupyter-ai-comment-cell').isVisible()
    ).toBe(true);
    expect(commandRegistry.hasCommand).not.toHaveBeenCalled();

    tracker.activeCell = { model: { type: 'markdown' } };
    tracker.activeCellChanged.emit(tracker.activeCell);
    expect(commandRegistry.notifyCommandChanged).toHaveBeenCalledWith(
      'toolbar-button:jupyter-ai-explain-cell'
    );
    expect(
      commands.get('toolbar-button:jupyter-ai-explain-cell').isVisible()
    ).toBe(false);
    expect(
      commands.get('toolbar-button:jupyter-ai-comment-cell').isVisible()
    ).toBe(false);
    expect(commandRegistry.notifyCommandChanged).toHaveBeenCalledWith(
      'toolbar-button:jupyter-ai-comment-cell'
    );
  });

  it('sends the comment-completion prompt to the persistent chat', async () => {
    const commands = new Map<string, any>();
    const commandRegistry = {
      addCommand: jest.fn((id, options) => commands.set(id, options)),
      hasCommand: jest.fn(() => true),
      notifyCommandChanged: jest.fn(),
      execute: jest.fn().mockResolvedValue(undefined)
    };
    const source = 'total = price * count';
    const tracker: any = {
      activeCell: {
        model: {
          type: 'code',
          sharedModel: { getSource: () => source }
        }
      },
      currentWidget: { sessionContext: { path: 'notes/example.ipynb' } }
    };
    tracker.activeCellChanged = new Signal(tracker);
    tracker.currentChanged = new Signal(tracker);
    const settingRegistry = { load: jest.fn(() => Promise.resolve({})) };

    cellActionsPlugin.activate!(
      { commands: commandRegistry } as any,
      tracker,
      settingRegistry as any
    );

    await commands.get('toolbar-button:jupyter-ai-comment-cell').execute();

    expect(commandRegistry.execute).toHaveBeenCalledWith(
      'jupyterlab-chat:openWithMessage',
      expect.objectContaining({
        name: 'example - Cell Assistant',
        inSidePanel: true,
        autoSend: true,
        input: expect.stringContaining(source)
      })
    );
    expect(commandRegistry.execute.mock.calls[0][1].input).toContain(
      '补充必要、准确、易懂的中文注释'
    );
  });
});
