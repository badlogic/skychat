export class IndexedDBStorage {
    private dbName: string;
    private dbVersion: number;
    private db: IDBDatabase | null = null;

    constructor(dbName: string, dbVersion: number) {
        this.dbName = dbName;
        this.dbVersion = dbVersion;
    }

    private async openDatabase(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = (event) => {
                const db = request.result;
                if (!db.objectStoreNames.contains("store")) {
                    db.createObjectStore("store");
                }
            };

            request.onsuccess = (event) => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                reject(request.error);
            };
        });
    }

    async set(key: string, value: any): Promise<void> {
        if (!this.db) {
            await this.openDatabase();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(["store"], "readwrite");
            const objectStore = transaction.objectStore("store");
            const request = objectStore.put(value, key);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = (event) => {
                reject(request.error);
            };
        });
    }

    async get(key: string): Promise<any | null> {
        if (!this.db) {
            await this.openDatabase();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(["store"], "readonly");
            const objectStore = transaction.objectStore("store");
            const request = objectStore.get(key);

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = (event) => {
                reject(request.error);
            };
        });
    }

    async remove(key: string): Promise<void> {
        if (!this.db) {
            await this.openDatabase();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(["store"], "readwrite");
            const objectStore = transaction.objectStore("store");
            const request = objectStore.delete(key);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = (event) => {
                reject(request.error);
            };
        });
    }

    async clear(): Promise<void> {
        if (!this.db) {
            await this.openDatabase();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(["store"], "readwrite");
            const objectStore = transaction.objectStore("store");
            const request = objectStore.clear();

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = (event) => {
                reject(request.error);
            };
        });
    }
}
