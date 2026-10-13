import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { ApiContext } from '../api/ApiContext';
import type { Study } from '../api/types';
import { FakeStudyApi } from './FakeStudyApi';

export interface Harness {
  api: FakeStudyApi;
  user: ReturnType<typeof userEvent.setup>;
}

/** Resolves or rejects a controlled response and lets React process it. */
export async function settle(action: () => void): Promise<void> {
  await act(async () => {
    action();
    await Promise.resolve();
  });
}

/** Renders the app and answers the initial list request with `studies`. */
export async function openApp(studies: Study[]): Promise<Harness> {
  const api = new FakeStudyApi();
  const user = userEvent.setup();
  render(
    <ApiContext.Provider value={api}>
      <App />
    </ApiContext.Provider>,
  );
  await screen.findByLabelText('Reviewer');
  await settle(() => api.listCalls[0]?.result.resolve(studies));
  return { api, user };
}

/** Selects a study in the worklist and answers its detail request. */
export async function openStudy(harness: Harness, study: Study): Promise<void> {
  await harness.user.click(screen.getByRole('button', { name: study.id }));
  await settle(() => {
    harness.api.lastGet(study.id).result.resolve(study);
  });
}

export function detailPanel(): HTMLElement {
  return screen.getByRole('region', { name: 'Study detail' });
}
