/**
 * Entry point. Mounts Mantine providers + react-router. The
 * AdminGate gates EVERYTHING below the auth boundary so unauthorised
 * traffic never gets to render an admin route.
 */
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';

import { MantineProvider, createTheme } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { AdminGate } from './auth/AdminGate';
import { App } from './App';

const theme = createTheme({
  primaryColor: 'indigo',
  defaultRadius: 'md',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme}>
      <Notifications position="top-right" />
      <BrowserRouter>
        <AdminGate>
          <App />
        </AdminGate>
      </BrowserRouter>
    </MantineProvider>
  </StrictMode>,
);
