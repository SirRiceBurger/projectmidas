import { openDB, type IDBPDatabase } from 'idb';
import { extractText } from './documentExtractor';

export interface StoredDocument {
  id: string;
  filename: string;
  fileType: string;
  sizeBytes: number;
  uploadedAt: number;
  extractedText: string;
  pageCount?: number;
  wordCount: number;
}

interface MidasDocDB {
  documents: StoredDocument;
  blobs: { id: string; blob: Blob };
}

const DB_NAME = 'midas-documents';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<MidasDocDB>> | null = null;

function getDB(): Promise<IDBPDatabase<MidasDocDB>> {
  if (!dbPromise) {
    dbPromise = openDB<MidasDocDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('documents')) {
          db.createObjectStore('documents', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('blobs')) {
          db.createObjectStore('blobs', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export async function storeDocument(file: File): Promise<StoredDocument> {
  const { text, pageCount } = await extractText(file);
  const wordCount = text
    .split(/\s+/)
    .filter((w) => w.length > 0).length;

  const doc: StoredDocument = {
    id: crypto.randomUUID(),
    filename: file.name,
    fileType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    uploadedAt: Date.now(),
    extractedText: text,
    pageCount,
    wordCount,
  };

  const db = await getDB();
  const tx = db.transaction(['documents', 'blobs'], 'readwrite');
  await tx.objectStore('documents').put(doc);
  await tx.objectStore('blobs').put({ id: doc.id, blob: file });
  await tx.done;

  return doc;
}

export async function getAllDocuments(): Promise<StoredDocument[]> {
  const db = await getDB();
  return db.getAll('documents');
}

export async function getDocumentBlob(id: string): Promise<Blob | undefined> {
  const db = await getDB();
  const entry = await db.get('blobs', id);
  return entry?.blob;
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['documents', 'blobs'], 'readwrite');
  await tx.objectStore('documents').delete(id);
  await tx.objectStore('blobs').delete(id);
  await tx.done;
}

export async function clearAllDocuments(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['documents', 'blobs'], 'readwrite');
  await tx.objectStore('documents').clear();
  await tx.objectStore('blobs').clear();
  await tx.done;
}

export function getTotalStorageEstimate(docs: StoredDocument[]): string {
  const totalBytes = docs.reduce((sum, d) => sum + d.sizeBytes, 0);
  if (totalBytes < 1024) return `${totalBytes} B`;
  if (totalBytes < 1024 * 1024) return `${(totalBytes / 1024).toFixed(1)} KB`;
  return `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;
}
