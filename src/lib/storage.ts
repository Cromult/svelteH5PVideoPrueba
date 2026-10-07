// Persistencia local de la demo. En el LMS real esto se reemplaza por llamadas a NestJS
// (JSON del video interactivo) y al storage de archivos (el MP4).
import type { InteractiveVideo } from './types.ts';

const PROJECT_KEY = 'ivideo:project';
const DB_NAME = 'ivideo';
const STORE = 'videos';

export function loadProject(): InteractiveVideo | null {
	try {
		const raw = localStorage.getItem(PROJECT_KEY);
		return raw ? (JSON.parse(raw) as InteractiveVideo) : null;
	} catch {
		return null;
	}
}

export function saveProject(project: InteractiveVideo): void {
	try {
		localStorage.setItem(PROJECT_KEY, JSON.stringify(project));
	} catch {
		// Sin almacenamiento (modo privado): la demo sigue funcionando en memoria.
	}
}

export function clearProject(): void {
	try {
		localStorage.removeItem(PROJECT_KEY);
	} catch {
		/* ignorar */
	}
}

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = () => req.result.createObjectStore(STORE);
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

async function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
	const db = await openDb();
	return new Promise<T>((resolve, reject) => {
		const req = fn(db.transaction(STORE, mode).objectStore(STORE));
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	}).finally(() => db.close());
}

export const saveVideo = (key: string, blob: Blob) => withStore('readwrite', (s) => s.put(blob, key));
export const loadVideo = (key: string) => withStore<Blob | undefined>('readonly', (s) => s.get(key));
export const deleteVideo = (key: string) => withStore('readwrite', (s) => s.delete(key));
