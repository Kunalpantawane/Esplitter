// DB Module - IndexedDB via Dexie with TypeScript
import Dexie, { type Table } from 'dexie';
import type { Session, Group, Transaction, PersonalExpense, Category, Budget } from './types';

class EsplitterDB extends Dexie {
  session!: Table<Session, string>;
  groups!: Table<Group, string>;
  transactions!: Table<Transaction, string>;
  personalExpenses!: Table<PersonalExpense, string>;
  categories!: Table<Category, string>;
  budgets!: Table<Budget, string>;

  constructor() {
    super('esplitterDB');

    this.version(1).stores({
      session: 'id',
      groups: 'id, name, inviteCode',
      transactions: 'clientId, groupId, syncStatus, createdAt',
    });

    this.version(2).stores({
      session: 'id',
      groups: 'id, name, inviteCode',
      transactions: 'clientId, groupId, syncStatus, createdAt, retryCount',
    });

    this.version(3).stores({
      session: 'id',
      groups: 'id, name, inviteCode',
      transactions: 'clientId, groupId, syncStatus, createdAt, retryCount',
      personalExpenses: 'clientId, category, date, syncStatus, paymentMethod',
      categories: 'id, name, isDefault',
      budgets: 'id, category, month',
    });

    this.version(4).stores({
      session: 'id',
      groups: 'id, name, inviteCode, settlementMode',
      transactions: 'clientId, groupId, syncStatus, createdAt, retryCount',
      personalExpenses: 'clientId, category, date, syncStatus, paymentMethod',
      categories: 'id, name, isDefault',
      budgets: 'id, category, month',
    });
  }
}

export const db = new EsplitterDB();
export default db;