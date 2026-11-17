export type LocalMediaKind = 'image' | 'video' | 'audio';

export interface InAppGalleryItem {
  id: string;
  name: string;
  kind: LocalMediaKind;
  size: number;
  lastModified: number;
  mimeType: string;
  file?: File;
  remoteUrl?: string;
  source: 'directory' | 'saved' | 'account';
}

const DB_NAME = 'alov_inapp_media_gallery_v1';
const DB_VERSION = 1;
const STORE_HANDLES = 'handles';
const STORE_ITEMS = 'items';
const DIR_HANDLE_KEY = 'primary_gallery_dir';

export function inferGalleryMediaKind(mime: string = '', fileName: string = ''): LocalMediaKind | null {
  const m = String(mime || '').toLowerCase();
  const n = String(fileName || '').toLowerCase();
  if (m.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|avif|bmp|heic)$/i.test(n)) return 'image';
  if (m.startsWith('video/') || /\.(mp4|webm|mov|m4v|3gp|mkv)$/i.test(n)) return 'video';
  if (m.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|flac|opus|weba)$/i.test(n)) return 'audio';
  return null;
}

function openGalleryDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_HANDLES)) {
          db.createObjectStore(STORE_HANDLES);
        }
        if (!db.objectStoreNames.contains(STORE_ITEMS)) {
          db.createObjectStore(STORE_ITEMS, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveDirectoryHandle(handle: any): Promise<void> {
  const db = await openGalleryDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_HANDLES, 'readwrite');
      tx.objectStore(STORE_HANDLES).put(handle, DIR_HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function loadSavedDirectoryHandle(): Promise<any | null> {
  const db = await openGalleryDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_HANDLES, 'readonly');
      const req = tx.objectStore(STORE_HANDLES).get(DIR_HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function clearSavedDirectoryHandle(): Promise<void> {
  const db = await openGalleryDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_HANDLES, 'readwrite');
      tx.objectStore(STORE_HANDLES).delete(DIR_HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function saveFilesToInAppLibrary(files: File[]): Promise<InAppGalleryItem[]> {
  if (!Array.isArray(files) || files.length === 0) return [];
  const db = await openGalleryDb();
  const added: InAppGalleryItem[] = [];

  for (const file of files) {
    const kind = inferGalleryMediaKind(file.type, file.name);
    if (!kind) continue;
    // Cap individual persisted IndexedDB blob at 40 MB to stay browser-safe
    if (file.size > 40 * 1024 * 1024) continue;
    const id = `lib_${file.name}_${file.size}_${file.lastModified}`;
    const item: InAppGalleryItem = {
      id,
      name: file.name,
      kind,
      size: file.size,
      lastModified: file.lastModified || Date.now(),
      mimeType: file.type || '',
      file,
      source: 'saved',
    };
    added.push(item);

    if (db) {
      await new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(STORE_ITEMS, 'readwrite');
          tx.objectStore(STORE_ITEMS).put({
            id: item.id,
            name: item.name,
            kind: item.kind,
            size: item.size,
            lastModified: item.lastModified,
            mimeType: item.mimeType,
            blob: file,
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    }
  }
  return added;
}

export async function loadInAppSavedMediaItems(limit = 60): Promise<InAppGalleryItem[]> {
  const db = await openGalleryDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_ITEMS, 'readonly');
      const req = tx.objectStore(STORE_ITEMS).getAll();
      req.onsuccess = () => {
        const raw = Array.isArray(req.result) ? req.result : [];
        const items: InAppGalleryItem[] = raw
          .filter((r) => r && r.blob)
          .map((r) => {
            const file =
              r.blob instanceof File
                ? r.blob
                : new File([r.blob], r.name || 'media', {
                    type: r.mimeType || 'application/octet-stream',
                    lastModified: r.lastModified || Date.now(),
                  });
            return {
              id: String(r.id),
              name: String(r.name || 'media'),
              kind: (r.kind as LocalMediaKind) || inferGalleryMediaKind(file.type, file.name) || 'image',
              size: Number(r.size || file.size || 0),
              lastModified: Number(r.lastModified || 0),
              mimeType: String(r.mimeType || file.type || ''),
              file,
              source: 'saved' as const,
            };
          })
          .sort((a, b) => b.lastModified - a.lastModified)
          .slice(0, limit);
        resolve(items);
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function readMediaFromDirectoryHandle(
  dirHandle: any,
  maxItems = 72,
  maxDepth = 2
): Promise<InAppGalleryItem[]> {
  if (!dirHandle || typeof dirHandle.values !== 'function') return [];
  const results: InAppGalleryItem[] = [];

  async function walk(handle: any, depth: number, prefix: string) {
    if (results.length >= maxItems || depth > maxDepth) return;
    try {
      for await (const entry of handle.values()) {
        if (results.length >= maxItems) break;
        if (entry.kind === 'file') {
          const kind = inferGalleryMediaKind('', entry.name);
          if (!kind) continue;
          try {
            const file: File = await entry.getFile();
            const confirmedKind = inferGalleryMediaKind(file.type, file.name) || kind;
            results.push({
              id: `dir_${prefix}${file.name}_${file.size}_${file.lastModified}`,
              name: file.name,
              kind: confirmedKind,
              size: file.size,
              lastModified: file.lastModified || 0,
              mimeType: file.type || '',
              file,
              source: 'directory',
            });
          } catch {}
        } else if (entry.kind === 'directory' && depth < maxDepth) {
          await walk(entry, depth + 1, `${prefix}${entry.name}/`);
        }
      }
    } catch {}
  }

  await walk(dirHandle, 0, '');
  return results.sort((a, b) => b.lastModified - a.lastModified);
}

export async function checkDirectoryHandlePermission(
  dirHandle: any,
  requestIfPrompt = false
): Promise<'granted' | 'prompt' | 'denied'> {
  if (!dirHandle || typeof dirHandle.queryPermission !== 'function') return 'denied';
  try {
    const status = await dirHandle.queryPermission({ mode: 'read' });
    if (status === 'granted') return 'granted';
    if (status === 'prompt' && requestIfPrompt && typeof dirHandle.requestPermission === 'function') {
      const asked = await dirHandle.requestPermission({ mode: 'read' });
      return asked === 'granted' ? 'granted' : asked === 'denied' ? 'denied' : 'prompt';
    }
    return status === 'denied' ? 'denied' : 'prompt';
  } catch {
    return 'denied';
  }
}

export function isFileSystemDirectoryPickerSupported(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    // Chrome blocks showDirectoryPicker inside cross-origin subframes; detect availability cleanly
    return typeof (window as any).showDirectoryPicker === 'function';
  } catch {
    return false;
  }
}
