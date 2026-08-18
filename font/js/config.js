const override = typeof globalThis !== 'undefined' && globalThis.localStorage ? globalThis.localStorage.getItem('GS_API_BASE') : '';
export const API_BASE = String(override || 'http://localhost:8080').replace(/\/$/, '');
export const PAYMENT_SECRET_DEFAULT = 'change_me';
