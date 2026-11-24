// Local/offline-safe Firebase stub
export const db = null as any;
export const getPublicId = () => 'anon_' + Math.random().toString(36).slice(2, 9);
export const handleFirestoreError = () => {};
export const OperationType = {};
export const sanitizeForFirestore = (x: any) => x;
