import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import type { ICodeCellModel } from '@jupyterlab/cells';
import { INotebookTracker } from '@jupyterlab/notebook';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { Notification } from '@jupyterlab/apputils';
import { LabIcon } from '@jupyterlab/ui-components';

import { buildCellActionPrompt } from './cell-action-prompts';
import type { CellAction } from './cell-action-prompts';

const OPEN_CHAT_WITH_MESSAGE = 'jupyterlab-chat:openWithMessage';
const EXPLAIN_CELL_COMMAND = 'toolbar-button:jupyter-ai-explain-cell';
const DEBUG_CELL_COMMAND = 'toolbar-button:jupyter-ai-debug-cell';
const CELL_ACTION_CHAT_NAME = 'Jupyter AI Cell Assistant';

/**
 * One persistent chat per notebook, so cell-action messages do not accumulate
 * in a single shared file. Falls back to the shared chat when the notebook
 * path is unavailable (e.g. never-saved notebook without a session path).
 */
function cellAssistantChatName(notebookTracker: INotebookTracker): string {
  const panel = notebookTracker.currentWidget;
  const path = panel?.sessionContext.path ?? '';
  const base = path.split('/').pop()?.replace(/\.ipynb$/, '') ?? '';
  return base ? `${base} - Cell Assistant` : CELL_ACTION_CHAT_NAME;
}

const explainCellIcon = new LabIcon({
  name: '@jupyter-ai/persona-manager:explain-cell',
  svgstr: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path fill="currentColor" d="M9 21a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-1H9v1Zm3-20a7 7 0 0 0-4 12.75V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-3.25A7 7 0 0 0 12 1Zm2.85 11.1-.85.6V16h-4v-3.3l-.85-.6A5 5 0 1 1 14.85 12.1Z"/>
  </svg>`
});

const debugCellIcon = new LabIcon({
  name: '@jupyter-ai/persona-manager:debug-cell',
  svgstr: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path fill="currentColor" d="M20 8h-2.81a5.98 5.98 0 0 0-1.46-1.9l1.45-1.45L15.77 3l-1.83 1.83a5.91 5.91 0 0 0-3.88 0L8.23 3 6.82 4.41l1.45 1.45A5.98 5.98 0 0 0 6.81 8H4v2h2.09a6.5 6.5 0 0 0-.09 1v1H4v2h2v1c0 .34.03.67.09 1H4v2h2.81A6 6 0 0 0 12 21a6 6 0 0 0 5.19-3H20v-2h-2.09c.06-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.03-.67-.09-1H20V8Zm-6 8h-4v-2h4v2Zm0-4h-4v-2h4v2Z"/>
  </svg>`
});

function activeCodeCell(
  notebookTracker: INotebookTracker
): ICodeCellModel | null {
  const cell = notebookTracker.activeCell;
  if (!cell || cell.model.type !== 'code') {
    return null;
  }
  return cell.model as ICodeCellModel;
}

function latestErrorText(cell: ICodeCellModel): string | null {
  const error = [...cell.outputs.toJSON()]
    .reverse()
    .find(output => output.output_type === 'error');
  if (!error || error.output_type !== 'error') {
    return null;
  }
  const summary = [error.ename, error.evalue].filter(Boolean).join(': ');
  const traceback = Array.isArray(error.traceback)
    ? error.traceback.join('\n')
    : typeof error.traceback === 'string'
      ? error.traceback
      : '';
  return [summary, traceback].filter(Boolean).join('\n');
}

async function sendCellAction(
  app: JupyterFrontEnd,
  notebookTracker: INotebookTracker,
  action: CellAction
): Promise<void> {
  const cell = activeCodeCell(notebookTracker);
  if (!cell) {
    return;
  }
  if (!app.commands.hasCommand(OPEN_CHAT_WITH_MESSAGE)) {
    Notification.emit(
      'The JupyterLab Chat command is not available. Make sure the Chat extension is enabled.',
      'warning',
      { autoClose: 8000 }
    );
    return;
  }

  const source = cell.sharedModel.getSource();
  const input = buildCellActionPrompt(
    action,
    source,
    action === 'debug' ? latestErrorText(cell) : null
  );

  // Keep cell-action requests together in one persistent chat, matching Mito's
  // reusable AI chat panel rather than creating a new chat for every click.
  await app.commands.execute(OPEN_CHAT_WITH_MESSAGE, {
    name: cellAssistantChatName(notebookTracker),
    inSidePanel: true,
    input,
    autoSend: true
  });
}

const cellActionsPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyter-ai/persona-manager:toolbar-buttons',
  description: 'Explain or debug the active notebook cell with Jupyter AI.',
  autoStart: true,
  requires: [INotebookTracker, ISettingRegistry],
  activate: (
    app: JupyterFrontEnd,
    notebookTracker: INotebookTracker,
    settingRegistry: ISettingRegistry
  ) => {
    // Visibility depends only on the selected cell. The Chat command may be
    // registered later by another federated extension; coupling visibility to
    // hasCommand() here can hide the toolbar permanently during startup.
    const hasActiveCodeCell = () =>
      notebookTracker.activeCell?.model.type === 'code';
    const refreshToolbarButtons = () => {
      app.commands.notifyCommandChanged(EXPLAIN_CELL_COMMAND);
      app.commands.notifyCommandChanged(DEBUG_CELL_COMMAND);
    };
    notebookTracker.activeCellChanged.connect(refreshToolbarButtons);
    notebookTracker.currentChanged.connect(refreshToolbarButtons);

    app.commands.addCommand(EXPLAIN_CELL_COMMAND, {
      caption: 'Explain this cell with Jupyter AI',
      icon: explainCellIcon,
      execute: () => sendCellAction(app, notebookTracker, 'explain'),
      isVisible: hasActiveCodeCell
    });

    app.commands.addCommand(DEBUG_CELL_COMMAND, {
      caption: 'Debug this cell with Jupyter AI',
      icon: debugCellIcon,
      execute: () => sendCellAction(app, notebookTracker, 'debug'),
      isVisible: hasActiveCodeCell
    });

    // Fetch this plugin's schema into the frontend settings registry. The
    // notebook toolbar factory aggregates `jupyter.lab.toolbars.Cell`
    // contributions from plugins present in the registry; without this load
    // the Explain/Debug items never reach the cell toolbar (the bundle and
    // schema ship fine, they are just never consulted).
    void settingRegistry
      .load(cellActionsPlugin.id)
      .then(() => {
        // The toolbar factory reacts to `pluginChanged` and merges this
        // plugin's Cell items into open notebooks' toolbars.
      })
      .catch((error: unknown) => {
        console.warn(
          '[jupyter-ai] Failed to load cell action toolbar settings:',
          error
        );
      });
  }
};

export default cellActionsPlugin;
