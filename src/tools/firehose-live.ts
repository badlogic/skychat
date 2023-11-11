import { ComAtprotoSyncSubscribeRepos, SubscribeReposMessage, subscribeRepos } from "atproto-firehose";
import { splitAtUri } from "../utils";
import { AppBskyEmbedRecord, AppBskyFeedPost } from "@atproto/api";

const queryTokens = process.argv.slice(2);
console.log(queryTokens);

const plainTokens = queryTokens.filter((token) => !token.startsWith("did:"));
const didTokens = queryTokens.filter((token) => token.startsWith("did:"));

const contains = (txt: string, tokens: string[]) => {
    for (const token of tokens) {
        if (txt.toLowerCase().includes(token)) return true;
    }
    return false;
};

let isStreaming = true;
let numStreamEvents = 0;
const onMessage = (message: SubscribeReposMessage) => {
    isStreaming = true;
    if (ComAtprotoSyncSubscribeRepos.isCommit(message)) {
        numStreamEvents++;
        message.ops.forEach((op) => {
            const from = message.repo;
            const payload = op.payload as any;
            switch (payload?.$type) {
                case "app.bsky.feed.like":
                    if (payload.subject?.uri) {
                        const to = splitAtUri(payload.subject.uri).repo;
                        if ((didTokens.length == 0 && plainTokens.length == 0) || contains(from, didTokens) || contains(to, didTokens)) {
                            console.log(`${from} liked a post by ${to}`);
                        }
                    }
                    break;
                case "app.bsky.feed.post":
                    if (AppBskyFeedPost.isRecord(payload)) {
                        if ((didTokens.length == 0 && plainTokens.length == 0) || contains(payload.text, plainTokens)) {
                            console.log(`Post by ${from}: ${payload.text}`);
                        }

                        if (payload.embed) {
                            if (AppBskyEmbedRecord.isMain(payload.embed)) {
                                const to = splitAtUri(payload.embed.record.uri).repo;
                                console.log(`${from} quoted post ${payload.embed.record.uri} from ${to}`);
                            }
                        }
                    }
                    break;
                case "app.bsky.feed.repost":
                    if (payload.subject?.uri) {
                        const to = splitAtUri(payload.subject.uri).repo;
                        if ((didTokens.length == 0 && plainTokens.length == 0) || contains(from, didTokens) || contains(to, didTokens)) {
                            console.log(`${from} reposted a post by ${to}`);
                        }
                    }
                    break;
                case "app.bsky.graph.follow":
                    if (payload.subject?.uri) {
                        const to = splitAtUri(payload.subject.uri).repo;
                        if ((didTokens.length == 0 && plainTokens.length == 0) || contains(from, didTokens) || contains(to, didTokens)) {
                            console.log(`${from} followed ${to}`);
                        }
                    }
                    break;
            }
        });
    }
};

const firehose = subscribeRepos("wss://bsky.network", { decodeRepoOps: true });
firehose.on("message", onMessage);
