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
    expect(commandRegistry.hasCommand).not.toHaveBeenCalled();

    tracker.activeCell = { model: { type: 'markdown' } };
    tracker.activeCellChanged.emit(tracker.activeCell);
    expect(commandRegistry.notifyCommandChanged).toHaveBeenCalledWith(
      'toolbar-button:jupyter-ai-explain-cell'
    );
    expect(
      commands.get('toolbar-button:jupyter-ai-explain-cell').isVisible()
    ).toBe(false);
  });
});
