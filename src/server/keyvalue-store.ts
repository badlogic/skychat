import * as fs from "fs";
import * as path from "path";
import { Pool } from "pg";

const pool = new Pool({
    user: process.env.POSTGRES_USER,
    host: "skychat_postgres",
    database: process.env.POSTGRES_DB,
    password: process.env.POSTGRES_PASSWORD,
    port: 5432,
});

function readFileSyncLineByLine(filePath: string, lineCallback: (line: string) => void) {
    try {
        const fileDescriptor = fs.openSync(filePath, "r");
        const buffer = Buffer.alloc(1024); // Adjust the buffer size as needed

        let bytesRead;
        let line = "";
        while ((bytesRead = fs.readSync(fileDescriptor, buffer, 0, buffer.length, null)) !== 0) {
            for (let i = 0; i < bytesRead; i++) {
                const char = String.fromCharCode(buffer[i]);
                if (char === "\n") {
                    lineCallback(line);
                    line = "";
                } else {
                    line += char;
                }
            }
        }

        // Handle the last line if it doesn't end with a newline character
        if (line.length > 0) {
            lineCallback(line);
        }

        fs.closeSync(fileDescriptor);
    } catch (error) {
        console.error("Error reading file:", error);
    }
}

export interface IdToStringsStore {
    initialize(): Promise<void>;
    add(key: string, value: string): void;
    remove(key: string, value: string): void;
    keys(): Promise<string[]>;
    has(key: string): Promise<boolean>;
    numEntries(key: string): Promise<number>;
    get(key: string): Promise<string[] | undefined>;
    getAll(): Promise<Map<string, Set<string>>>;
}

export class FileIdToStringsStore implements IdToStringsStore {
    constructor(readonly filePath: string) {}

    async initialize() {
        const dir = path.dirname(this.filePath);

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        if (!fs.existsSync(this.filePath)) {
            fs.writeFileSync(this.filePath, "");
        }
    }

    add(key: string, value: string): void {
        fs.appendFileSync(this.filePath, `+ ${key} ${value}\n`);
    }

    remove(key: string, value: string): void {
        fs.appendFileSync(this.filePath, `- ${key} ${value}\n`);
    }

    async keys() {
        return Array.from((await this.getAll()).keys());
    }

    async has(key: string) {
        return (await this.getAll()).has(key);
    }

    async numEntries(key: string) {
        return (await this.getAll()).size;
    }

    async get(key: string) {
        const values = (await this.getAll()).get(key);
        if (values) return Array.from(values);
        else return values;
    }

    async getAll(): Promise<Map<string, Set<string>>> {
        const result = new Map<string, Set<string>>();
        readFileSyncLineByLine(this.filePath, (line) => {
            const [command, key, value] = line.split(" ");
            if (command === "+") {
                let values = result.get(key);
                if (!values) {
                    values = new Set<string>();
                    result.set(key, values);
                }
                values.add(value);
            } else if (command === "-") {
                const values = result.get(key);
                if (values) values.delete(value);
            }
        });
        return result;
    }
}

export class CompressingIdToStringsStore implements IdToStringsStore {
    constructor(
        readonly store: IdToStringsStore,
        readonly compress: (v: string, isKey: boolean) => string,
        readonly uncompress: (v: string, isKey: boolean) => string
    ) {}

    async initialize() {
        await this.store.initialize();
    }

    add(key: string, value: string): void {
        key = this.compress(key, true);
        value = this.compress(value, false);
        this.store.add(key, value);
    }

    remove(key: string, value: string): void {
        key = this.compress(key, true);
        value = this.compress(value, false);
        this.store.remove(key, value);
    }

    async keys() {
        return (await this.store.keys()).map((key) => this.uncompress(key, true));
    }

    async has(key: string) {
        key = this.compress(key, true);
        return this.store.has(key);
    }

    async numEntries(key: string) {
        key = this.compress(key, true);
        return this.store.numEntries(key);
    }

    async get(key: string) {
        key = this.compress(key, true);
        const values = await this.store.get(key);
        if (!values) return values;
        return values.map((value) => this.uncompress(value, false));
    }

    async getAll() {
        const result = new Map<string, Set<string>>();
        const all = await this.store.getAll();
        for (const key of all.keys()) {
            const values = all.get(key);
            if (values) {
                let resultValues = result.get(key);
                if (!resultValues) {
                    resultValues = new Set<string>();
                    result.set(key, resultValues);
                }
                for (const value of values) {
                    resultValues.add(value);
                }
            }
        }
        return result;
    }
}

export class PostgresIdToStringsStore implements IdToStringsStore {
    constructor(readonly tableName: string) {}

    async initialize(): Promise<void> {
        const tableExistsQuery = `
            SELECT EXISTS (
                SELECT FROM pg_tables
                WHERE  schemaname = 'public'
                AND    tablename  = $1
            );
        `;

        const tableExistsResult = await pool.query(tableExistsQuery, [this.tableName]);
        if (!tableExistsResult.rows[0].exists) {
            await pool.query(`
                CREATE TABLE ${this.tableName} (
                    key TEXT NOT NULL,
                    value TEXT NOT NULL
                );
                CREATE INDEX idx_${this.tableName}_key ON ${this.tableName}(key);
            `);
        }
    }

    public async add(key: string, value: string): Promise<void> {
        await pool.query(`INSERT INTO ${this.tableName}(key, value) VALUES($1, $2)`, [key, value]);
    }

    public async remove(key: string, value: string): Promise<void> {
        await pool.query(`DELETE FROM ${this.tableName} WHERE key = $1 AND value = $2`, [key, value]);
    }

    public async keys(): Promise<string[]> {
        const result = await pool.query(`SELECT DISTINCT key FROM ${this.tableName}`);
        return result.rows;
    }

    public async has(key: string) {
        const result = await pool.query(`SELECT 1 FROM ${this.tableName} WHERE key = $1 LIMIT 1`, [key]);
        return (result.rowCount ?? 0) > 0;
    }

    public async numEntries(key: string): Promise<number> {
        const result = await pool.query(`SELECT COUNT(*) FROM ${this.tableName} WHERE key = $1`, [key]);
        return parseInt(result.rows[0].count, 10);
    }

    public async get(key: string): Promise<string[] | undefined> {
        const result = await pool.query(`SELECT value FROM ${this.tableName} WHERE key = $1`, [key]);
        return result.rows.length > 0 ? result.rows : undefined;
    }

    public async getAll(): Promise<Map<string, Set<string>>> {
        const result = await pool.query(`SELECT key, value FROM ${this.tableName}`);
        const keyValuePairs: Map<string, Set<string>> = new Map();

        result.rows.forEach((row) => {
            const key = row.key;
            const value = row.value;

            const values = keyValuePairs.get(key);
            if (values) {
                let resultValues = keyValuePairs.get(key);
                if (!resultValues) {
                    resultValues = new Set<string>();
                    keyValuePairs.set(key, resultValues);
                }
                resultValues.add(value);
            }
        });
        return keyValuePairs;
    }
}

export class CachingIdToStringsStore implements IdToStringsStore {
    private memory = new Map<string, Set<string>>();

    constructor(readonly store: IdToStringsStore) {}

    async initialize() {
        //
        await this.store.initialize();
        const result = await this.store.getAll();
        for (const key of result.keys()) {
            this.memory.set(key, new Set<string>(result.get(key)));
        }
    }

    private addToMemory(key: string, value: string): boolean {
        if (!this.memory.has(key)) {
            this.memory.set(key, new Set<string>());
        }
        let valueExists = this.memory.get(key)?.has(value);
        if (valueExists) return true;
        this.memory.get(key)?.add(value);
        return false;
    }

    private removeFromMemory(key: string, value: string): boolean {
        if (!this.memory.get(key)) return false;
        this.memory.get(key)?.delete(value);
        return true;
    }

    add(key: string, value: string): void {
        if (!this.addToMemory(key, value)) this.store.add(key, value);
    }

    remove(key: string, value: string): void {
        if (this.removeFromMemory(key, value)) this.store.remove(key, value);
    }

    async keys() {
        return [...this.memory.keys()];
    }

    async has(key: string) {
        return this.memory.has(key);
    }

    async numEntries(key: string) {
        if (!this.memory.has(key)) return 0;
        return this.memory.get(key)!.size;
    }

    async get(key: string) {
        const values = Array.from(this.memory.get(key) || []);
        return values.length > 0 ? values : undefined;
    }

    async getAll() {
        return this.memory;
    }
}
