import { ComAtprotoSyncSubscribeRepos, SubscribeReposMessage, XrpcEventStreamClient, subscribeRepos } from "atproto-firehose";
import { splitAtUri } from "../utils";
import { AppBskyEmbedRecord, AppBskyFeedPost, AppBskyRichtextFacet } from "@atproto/api";

export type FirehoseEvent = (
    | { type: "like"; postUri: string }
    | { type: "reply"; postUri: string }
    | { type: "quote"; postUri: string; quotedUri: string }
    | { type: "repost"; postUri: string }
    | { type: "mention"; postUri: string }
    | { type: "follow" }
) & { fromDid: string; toDid: string };

export type FirehoseSubscriber = (event: FirehoseEvent) => void;

export class Firehose {
    lastEventTime = new Date().getTime();
    readonly listeners: FirehoseSubscriber[] = [];
    stats = {
        isStreaming: false,
        numStreamEvents: 0,
        numStreamRestarts: 0,
        streamStartNano: performance.now(),
    };

    start() {
        let firehoseClient: XrpcEventStreamClient;
        const setupStream = () => {
            this.stats.numStreamRestarts++;
            console.log("(Re-)starting stream");
            firehoseClient = subscribeRepos(`wss://bsky.network`, { decodeRepoOps: true });
            firehoseClient.on("message", (message: SubscribeReposMessage) => this.onMessage(message));
            firehoseClient.on("error", (code, reason) => {
                try {
                    firehoseClient.close();
                } catch (e) {}
                setTimeout(setupStream, 2000);
            });
            firehoseClient.on("close", () => setTimeout(setupStream, 2000));
        };
        setupStream();

        // Health check of stream
        setInterval(() => {
            if (new Date().getTime() - this.lastEventTime > 10000) {
                console.error("Firehose timed out, restarting");
                this.lastEventTime = new Date().getTime();
                firehoseClient.close();
            }
        }, 2000);
    }

    notify(event: FirehoseEvent) {
        for (const listener of this.listeners) {
            listener(event);
        }
    }

    onMessage(message: SubscribeReposMessage) {
        this.stats.isStreaming = true;
        this.lastEventTime = new Date().getTime();
        if (ComAtprotoSyncSubscribeRepos.isCommit(message)) {
            this.stats.numStreamEvents++;
            message.ops.forEach((op) => {
                const from = message.repo;
                const payload = op.payload as any;
                if (op.action == "delete") {
                    // FIXME do something with deletes.
                }
                let postUri: string | undefined;
                try {
                    switch (payload?.$type) {
                        case "app.bsky.feed.like":
                            if (payload.subject?.uri) {
                                const to = splitAtUri(payload.subject.uri).repo;
                                postUri = payload.subject?.uri;
                                if (postUri) this.notify({ type: "like", fromDid: from, toDid: to, postUri });
                            }
                            break;
                        case "app.bsky.feed.post":
                            if (AppBskyFeedPost.isRecord(payload)) {
                                if (payload.reply) {
                                    if (payload.reply) {
                                        let uri;
                                        if (payload.reply.parent) {
                                            uri = payload.reply.parent.uri;
                                        } else {
                                            uri = payload.reply.root?.uri;
                                        }
                                        if (uri) {
                                            postUri = "at://" + from + "/" + op.path;
                                            const to = splitAtUri(uri).repo;
                                            this.notify({ type: "reply", fromDid: from, toDid: to, postUri });
                                        }
                                    }
                                }

                                if (payload.facets) {
                                    for (const facet of payload.facets) {
                                        for (const feature of facet.features) {
                                            if (AppBskyRichtextFacet.isMention(feature)) {
                                                const to = feature.did;
                                                if (postUri) this.notify({ type: "mention", fromDid: from, toDid: to, postUri });
                                            }
                                        }
                                    }
                                }

                                if (payload.embed) {
                                    if (AppBskyEmbedRecord.isMain(payload.embed)) {
                                        const to = splitAtUri(payload.embed.record.uri).repo;
                                        const quotedUri = payload.embed.record.uri;
                                        this.notify({ type: "quote", fromDid: from, toDid: to, postUri: "at://" + from + "/" + op.path, quotedUri });
                                    }
                                }
                            }
                            break;
                        case "app.bsky.feed.repost":
                            if (payload.subject?.uri) {
                                const to = splitAtUri(payload.subject.uri).repo;
                                postUri = payload.subject.uri;
                                if (postUri) this.notify({ type: "repost", fromDid: from, toDid: to, postUri });
                            }
                            break;
                        case "app.bsky.graph.follow":
                            if (payload.subject?.uri) {
                                const to = splitAtUri(payload.subject).repo;
                                this.notify({ type: "follow", fromDid: from, toDid: to });
                            }
                            break;
                    }
                } catch (e) {
                    console.error("Error processing message op.", e);
                }
            });
        }
    }
}
