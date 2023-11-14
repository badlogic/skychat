import * as fs from "fs";
import * as readline from "readline";

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

export interface KeyValueStore {
    add(key: string, value: string): void;
    remove(key: string, value: string): void;
    keys(): string[];
    has(key: string): boolean;
    numEntries(key: string): number;
    get(key: string): string[] | undefined;
}

export class FileKeyValueStore implements KeyValueStore {
    private memory: Map<string, Set<string>>;
    private filePath: string;

    constructor(
        filePath: string,
        readonly compress: (v: string, isKey: boolean) => string,
        readonly uncompress: (v: string, isKey: boolean) => string
    ) {
        this.filePath = filePath;
        this.memory = new Map<string, Set<string>>();
        this.initializeStore();
    }

    private initializeStore(): void {
        if (!fs.existsSync(this.filePath)) {
            fs.writeFileSync(this.filePath, "");
        }

        readFileSyncLineByLine(this.filePath, (line) => {
            const [command, key, value] = line.split(" ");
            if (command === "+") {
                this.addToMemory(key, value);
            } else if (command === "-") {
                this.removeFromMemory(key, value);
            }
        });
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
        key = this.compress(key, true);
        value = this.compress(value, true);
        if (!this.addToMemory(key, value)) fs.appendFileSync(this.filePath, `+ ${key} ${value}\n`);
    }

    remove(key: string, value: string): void {
        key = this.compress(key, true);
        value = this.compress(value, true);
        if (this.removeFromMemory(key, value)) fs.appendFileSync(this.filePath, `- ${key} ${value}\n`);
    }

    keys(): string[] {
        return [...this.memory.keys()].map((key) => this.uncompress(key, true));
    }

    has(key: string): boolean {
        key = this.compress(key, true);
        return this.memory.has(key);
    }

    numEntries(key: string): number {
        key = this.compress(key, true);
        if (!this.memory.has(key)) return 0;
        return this.memory.get(key)!.size;
    }

    get(key: string): string[] | undefined {
        key = this.compress(key, true);
        const values = Array.from(this.memory.get(key) || []);
        const result = values.map((value) => this.uncompress(value, false));
        return result.length > 0 ? result : undefined;
    }
}
