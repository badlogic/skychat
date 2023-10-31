import { CarReader } from "@ipld/car/reader";
import { decode as cborDecode } from "@ipld/dag-cbor";
export { ComAtprotoSyncSubscribeRepos } from "@atproto/api";
import { AtpBaseClient } from "@atproto/api";
import { decodeMultiple } from "cbor-x";
import { Post } from "./bsky";

export const startEventStream = (onPost: (post: Post) => void, onClose: () => void) => {
    return new BskyEventStream(onPost, onClose);
};

export class BskyEventStream {
    serviceUri = "bsky.social";
    nsid = "com.atproto.sync.subscribeRepos";
    closed: boolean = false;

    protected ws: WebSocket;
    protected baseClient = new AtpBaseClient();

    constructor(private onPost: (post: Post) => void, private onClose: () => void) {
        this.serviceUri = "bsky.social";
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
                        if (blocks.length < 2) continue;
                        const payload = blocks[blocks.length - 2];
                        if (payload["$type"] != "app.bsky.feed.post") continue;
                        const payloadDid = blocks[blocks.length - 1];
                        if (!payloadDid["did"]) continue;

                        op.post = {
                            authorDid: payloadDid["did"],
                            rkey: op.path.split("/")[1],
                            ...payload,
                        } as Post;
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
                    const post: Post = op.post;
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
