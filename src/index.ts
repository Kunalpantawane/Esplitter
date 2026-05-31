// Main entry point - Import all TypeScript modules
import './styles/main.css';

import { Auth } from './ts/auth';
import { Sync } from './ts/sync';
import { db } from './ts/db';
import { Api } from './ts/api';
import type { Session, Group, Transaction, User } from './ts/types';

// Make available globally for non-TypeScript code
(window as unknown as { 
  Auth: typeof Auth; 
  Sync: typeof Sync; 
  db: typeof db; 
  Api: typeof Api 
}).Auth = Auth;
(window as unknown as { UI: unknown }).UI = null; // Will be loaded from ui.ts
(window as unknown as { Tracker: unknown }).Tracker = null;
(window as unknown as { TrackerUI: unknown }).TrackerUI = null;

console.log('Esplitter TypeScript modules loaded');
export { Auth, Sync, db, Api };
export type { Session, Group, Transaction, User };