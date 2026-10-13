import { createContext, useContext } from 'react';
import type { StudyApi } from './StudyApi';

export const ApiContext = createContext<StudyApi | null>(null);

export function useApi(): StudyApi {
  const api = useContext(ApiContext);
  if (api === null) {
    throw new Error('ApiContext.Provider is missing');
  }
  return api;
}
