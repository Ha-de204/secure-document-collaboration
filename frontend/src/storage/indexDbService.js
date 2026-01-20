import { openDB } from 'idb';

const DB_NAME = 'secure-doc-collab-db';
const VERSION = 1;

export const getDB = async () => {
  return openDB(DB_NAME, VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('documents')) {
        db.createObjectStore('documents', { keyPath: 'localDocId' });
      }
      if (!db.objectStoreNames.contains('blocks')) {
        const blocks = db.createObjectStore('blocks', { keyPath: 'localBlockId' });
        blocks.createIndex('by-document', 'documentId');
        blocks.createIndex('by-blockId', 'blockId');  
        blocks.createIndex('by-doc-block', ['documentId', 'blockId']);
      }
      if (!db.objectStoreNames.contains('identityKey')) {
        db.createObjectStore('identityKey', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('publicKeys')) {
        db.createObjectStore('publicKeys', { keyPath: 'userId' });
        
      }
      if (!db.objectStoreNames.contains('document_keys')) {
        const drk = db.createObjectStore('document_keys', { keyPath: ['documentId', 'epoch']});
        drk.createIndex('documentId','documentId')
      }
      if (!db.objectStoreNames.contains('doubleRatchetState')) {
        db.createObjectStore('doubleRatchetState', { keyPath: 'peerId' });
      }
      if (!db.objectStoreNames.contains('skippedMessageKeys')) {
        const store = db.createObjectStore('skippedMessageKeys', { keyPath: 'id' });

        store.createIndex('by-session', 'sessionId');
        store.createIndex('by-ratchet', 'ratchetPublicKey');
        }

    },
    });
};