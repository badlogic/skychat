import { AtpBaseClient } from "@atproto/api";
import { CarReader } from "@ipld/car/reader";
import { decode as cborDecode } from "@ipld/dag-cbor";
import { decodeMultiple } from "cbor-x";
export { ComAtprotoSyncSubscribeRepos } from "@atproto/api";

export type FirehosePost = {
    uri: string;
    authorDid: string;
    rkey: string;
    text: string;
    createdAt: string;
};

export const startEventStream = (onPost: (post: FirehosePost) => void, onClose: () => void) => {
    return new BskyEventStream(onPost, onClose);
};

export class BskyEventStream {
    serviceUri = "bsky.network";
    nsid = "com.atproto.sync.subscribeRepos";
    closed: boolean = false;

    protected ws: WebSocket;
    protected baseClient = new AtpBaseClient();

    constructor(private onPost: (post: FirehosePost) => void, private onClose: () => void) {
        this.serviceUri = "bsky.network";
        this.nsid = "com.atproto.sync.subscribeRepos";
        this.ws = new WebSocket(`wss://${this.serviceUri}/xrpc/${this.nsid}`);
        this.ws.binaryType = "arraybuffer";
        this.ws.onmessage = (ev) => this.handleMessage(ev.data);
        this.ws.onerror = (ev) => this.handleError("Error");
        this.ws.onclose = (ev) => this.handleClose(ev.code, ev.reason);
    }

    close(code?: number, reason?: string) {
        this.ws.close(code, reason);
    }

    async decode(message: any) {
        if (message["$type"] == "com.atproto.sync.subscribeRepos#commit") {
            for (const op of message.ops) {
                if (op.action == "create" || op.action == "update") {
                    const cr = await CarReader.fromBytes(message.blocks);
                    if (op.cid) {
                        const blocks = cr._blocks.map((block) => cborDecode(block.bytes)) as any[];
                        for (const block of blocks) {
                            if (block["$type"] == "app.bsky.feed.post") {
                                op.post = {
                                    uri: `at://${message.repo}/app.bsky.feed.post/${op.path.split("/")[1]}`,
                                    authorDid: message.repo,
                                    rkey: op.path.split("/")[1],
                                    ...block,
                                } as FirehosePost;
                                break;
                            }
                        }
                    }
                }
            }
            return message;
        } else {
            return undefined;
        }
    }

    private async handleMessage(data: ArrayBuffer) {
        const [header, payload] = decodeMultiple(new Uint8Array(data)) as any;
        if (header["op"] == 1) {
            const t = header["t"];
            if (t && t == "#commit") {
                const message = {
                    $type: `${this.nsid}${t}`,
                    ...payload,
                };
                const decoded = await this.decode(message);
                if (!decoded) return;

                for (const op of decoded.ops) {
                    const post: FirehosePost = op.post;
                    if (!post) continue;
                    this.onPost(post);
                }
            }
        } else {
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
