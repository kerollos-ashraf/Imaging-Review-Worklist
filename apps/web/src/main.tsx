import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ApiContext } from './api/ApiContext';
import { HttpStudyApi } from './api/StudyApi';
import './styles.css';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Root element not found');
}

createRoot(container).render(
  <StrictMode>
    <ApiContext.Provider value={new HttpStudyApi()}>
      <App />
    </ApiContext.Provider>
  </StrictMode>,
);
