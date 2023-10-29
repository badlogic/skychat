import { ComAtprotoSyncSubscribeRepos, FollowRecord } from "@atproto/api";
import { CarReader } from "@ipld/car/reader";
import { decode as cborDecode } from "@ipld/dag-cbor";
export { ComAtprotoSyncSubscribeRepos } from "@atproto/api";
import { AtpBaseClient } from "@atproto/api";
import { decodeMultiple } from "cbor-x";

export class EventStreamError extends Error {
    constructor(error: string, message?: string) {
        super(message ? `${error}: ${message}` : error);
    }
}

export type SubscribeReposMessage =
    | ComAtprotoSyncSubscribeRepos.Commit
    | ComAtprotoSyncSubscribeRepos.Handle
    | ComAtprotoSyncSubscribeRepos.Info
    | ComAtprotoSyncSubscribeRepos.Migrate
    | ComAtprotoSyncSubscribeRepos.Tombstone;

export interface SubscribeRepoOptions {
    decodeRepoOps?: boolean;
    filter?: RepoOpsFilterFunc;
}

export type RepoOpsFilterFunc = (message: ComAtprotoSyncSubscribeRepos.Commit, repoOp: ComAtprotoSyncSubscribeRepos.RepoOp) => boolean;

export const subscribeRepos = (onMessage: (message: any) => void, onClose: () => void) => {
    return new XrpcEventStreamClient("bsky.social", "com.atproto.sync.subscribeRepos", decoder({ decodeRepoOps: true }), onMessage, onClose);
};

const decoder = (options: SubscribeRepoOptions) => {
    return async (client: XrpcEventStreamClient, message: any) => {
        if (message["$type"] == "com.atproto.sync.subscribeRepos#commit") {
            await decodeOps(message, options.filter);
            return message;
        } else {
            return undefined;
        }
    };
};

const decodeOps = async (message: ComAtprotoSyncSubscribeRepos.Commit, filter: RepoOpsFilterFunc | undefined): Promise<void> => {
    for (const op of message.ops) {
        if (filter && !filter(message, op)) {
            continue;
        }
        if (op.action == "create" || op.action == "update") {
            const cr = await CarReader.fromBytes(message.blocks);
            if (op.cid) {
                const blocks = cr._blocks.map((block) => cborDecode(block.bytes)) as any[];
                const payloads = [];
                for (const block of blocks) {
                    if (block["$type"]) {
                        payloads.push(block);
                    }
                }
                op.payloads = payloads;
            }
        }
    }
};

export type Decoder = (client: XrpcEventStreamClient, message: unknown) => Promise<ComAtprotoSyncSubscribeRepos.Commit | undefined>;

export type Like = {
    $type: "app.bsky.feed.like";
    createdAt: string;
    subject: {
        cid: string;
        uri: string;
    };
};

export type Follow = {
    $type: "app.bsky.graph.follow";
};

export type Repost = {
    $type: "app.bsky.feed.repost";
};

export type Post = {
    $type: "app.bsky.feed.post";
};

export class XrpcEventStreamClient {
    serviceUri: string;
    nsid: string;
    decoder: Decoder;
    closed: boolean = false;

    protected ws: WebSocket;
    protected baseClient = new AtpBaseClient();

    constructor(serviceUri: string, nsid: string, decoder: Decoder, private onMessage: (message: any) => void, private onClose: () => void) {
        this.serviceUri = serviceUri;
        this.nsid = nsid;
        this.decoder = decoder;
        this.ws = new WebSocket(`wss://${this.serviceUri}/xrpc/${this.nsid}`);
        this.ws.binaryType = "arraybuffer";
        this.ws.onmessage = (ev) => this.handleMessage(ev.data);
        this.ws.onerror = (ev) => this.handleError("on error");
        this.ws.onclose = (ev) => this.handleClose(ev.code, ev.reason);
    }

    close(code?: number, reason?: string) {
        this.ws.close(code, reason);
    }

    private async handleMessage(data: ArrayBuffer) {
        const [header, payload] = decodeMultiple(new Uint8Array(data)) as any;
        if (header["op"] == 1) {
            // regular message
            const t = header["t"];
            if (t) {
                const lexUri = this.nsid;
                const message = {
                    $type: `${this.nsid}${t}`,
                    ...payload,
                };
                const decoded = await this.decoder(this, message);
                if (!decoded) return;
                const follows: Follow[] = [];
                const likes: Like[] = [];
                const resposts: any[] = [];
                const posts: any[] = [];
                for (const op of decoded.ops) {
                    const payloads: any = op.payloads;
                    if (!payloads) continue;
                    for (const payload of payloads) {
                        if (payload["$type"] == "app.bsky.feed.like") {
                            likes.push(payload);
                        } else if (payload["$type"] == "app.bsky.graph.follow") {
                            follows.push(payload);
                        } else {
                            console.log(payload);
                        }
                    }
                }
                if (decoded.payload) {
                    this.onMessage(decoded.payload);
                }
            }
        } else {
            // error message
            this.handleError(header["error"], header["message"]);
        }
    }

    private handleError(error: Error | string, message?: string) {
        this.close();
    }

    private handleClose(code: number | undefined, reason: string | undefined) {
        this.closed = true;
        this.onClose();
    }
}
