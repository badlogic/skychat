import compression from "compression";
import express from "express";
import * as http from "http";
import cors from "cors";
import * as admin from "firebase-admin";
import { applicationDefault } from "firebase-admin/app";
import { ComAtprotoSyncSubscribeRepos, SubscribeReposMessage, XrpcEventStreamClient, subscribeRepos } from "atproto-firehose";
import { AppBskyEmbedRecord, AppBskyFeedPost } from "@atproto/api";
import { formatFileSize, getTimeDifference, splitAtUri } from "../utils";
import * as fsSync from "fs";
import { FileKeyValueStore, KeyValueStore } from "./keyvalue-store";

type Notification = { type: "like" | "reply" | "quote" | "repost" | "follow"; fromDid: string; toDid: string; tokens: string[]; postUri?: string };

const port = process.env.PORT ?? 3333;
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log("Please set GOOGLE_APPLICATION_CREDENTIALS to the file path of your Firebase service credentials file.");
    process.exit(-1);
}

if (!fsSync.existsSync("data")) {
    fsSync.mkdirSync("data");
}

const compressAtUri = (v: string, isKey: boolean) => {
    return v.replace("at://", "").replace("app.bsky.feed.post/", "");
};
const uncompressAtUri = (v: string, isKey: boolean) => {
    const tokens = v.split("/");
    if (tokens.length == 2) return "at://" + tokens[0] + "/app.bsky.feed.post/" + tokens[1];
    return "at://" + v;
};

function migrate(
    oldFile: string,
    newFile: string,
    compress: (v: string, isKey: boolean) => string,
    uncompress: (v: string, isKey: boolean) => string
): KeyValueStore {
    if (fsSync.existsSync(oldFile) && !fsSync.existsSync(newFile) && oldFile.endsWith(".json")) {
        const oldData = JSON.parse(fsSync.readFileSync(oldFile, "utf8")) as Record<string, string[]>;
        const store = new FileKeyValueStore(newFile, compress, uncompress);
        for (const key of Object.keys(oldData)) {
            const values = oldData[key];
            for (const value of values) store.add(key, value);
        }
        return store;
    }
    return new FileKeyValueStore(newFile, compress, uncompress);
}

const oldRegistrationsFile = "data/registrations.json";
const registrationsFile = "data/registrations.kvdb";
const oldQuotesFile = "data/quotes.json";
const quotesFile = "data/quotes.kvdb";

const registrations = migrate(
    oldRegistrationsFile,
    registrationsFile,
    (v) => v,
    (v) => v
);
const quotes = migrate(oldQuotesFile, quotesFile, compressAtUri, uncompressAtUri);
const queue: Notification[] = [];
const streamErrors: { code: string; reason: string; date: string; postUri?: string }[] = [];

let serverStart = new Date();
let streamStartNano = performance.now();
let isStreaming = false;
let numStreamEvents = 0;
let numStreamRestarts = 0;
let numPushMessages = 0;
let numQuotes = 0 + 0;
for (const quote of quotes.keys()) {
    numQuotes += quotes.get(quote)?.length ?? 0;
}
let numDidWebRequests = 0;
let numHtmlRequests = 0;
let lastEventTime = new Date().getTime();

(async () => {
    const app = express();
    app.set("json spaces", 2);
    app.use(cors());
    app.use(compression());
    app.use(express.static("./"));

    const firebase = admin.initializeApp({ credential: applicationDefault() });
    const pushService = firebase.messaging();

    const onMessage = (message: SubscribeReposMessage) => {
        isStreaming = true;
        lastEventTime = new Date().getTime();
        if (ComAtprotoSyncSubscribeRepos.isCommit(message)) {
            numStreamEvents++;
            message.ops.forEach((op) => {
                const from = message.repo;
                const payload = op.payload as any;
                let postUri: string | undefined;
                try {
                    switch (payload?.$type) {
                        case "app.bsky.feed.like":
                            if (payload.subject?.uri) {
                                const to = splitAtUri(payload.subject.uri).repo;
                                postUri = payload.subject?.uri;
                                const tokens = registrations.get(to);
                                if (tokens && from != to) {
                                    queue.push({ type: "like", fromDid: from, toDid: to, tokens, postUri });
                                }
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
                                            const tokens = registrations.get(to);
                                            if (tokens && from != to) {
                                                queue.push({ type: "reply", fromDid: from, toDid: to, tokens, postUri });
                                            }
                                        }
                                    }
                                }

                                if (payload.embed) {
                                    if (AppBskyEmbedRecord.isMain(payload.embed)) {
                                        const to = splitAtUri(payload.embed.record.uri).repo;
                                        postUri = payload.embed.record.uri;
                                        const tokens = registrations.get(to);
                                        if (tokens && from != to) {
                                            queue.push({ type: "quote", fromDid: from, toDid: to, tokens, postUri });
                                        }
                                        quotes.add(postUri, "at://" + from + "/" + op.path);
                                        numQuotes++;
                                    }
                                }
                            }
                            break;
                        case "app.bsky.feed.repost":
                            if (payload.subject?.uri) {
                                const to = splitAtUri(payload.subject.uri).repo;
                                postUri = payload.subject.uri;
                                const tokens = registrations.get(to);
                                if (tokens && from != to) {
                                    queue.push({ type: "repost", fromDid: from, toDid: to, tokens, postUri });
                                }
                            }
                            break;
                        case "app.bsky.graph.follow":
                            if (payload.subject?.uri) {
                                const to = splitAtUri(payload.subject).repo;
                                const tokens = registrations.get(to);
                                if (tokens && from != to) {
                                    queue.push({ type: "follow", fromDid: from, toDid: to, tokens });
                                }
                            }
                            break;
                    }
                } catch (e) {
                    console.error("Error processing message op.", e);
                }
            });
        }
    };

    let firehoseClient: XrpcEventStreamClient;
    const setupStream = () => {
        numStreamRestarts++;
        console.log("(Re-)starting stream");
        firehoseClient = subscribeRepos(`wss://bsky.network`, { decodeRepoOps: true });
        firehoseClient.on("message", onMessage);
        firehoseClient.on("error", (code, reason) => {
            streamErrors.push({ date: new Date().toString(), code, reason });
            try {
                firehoseClient.close();
            } catch (e) {}
            setupStream();
        });
        firehoseClient.on("close", () => setupStream());
    };
    setupStream();

    // Health check of stream
    setInterval(() => {
        if (new Date().getTime() - lastEventTime > 10000) {
            console.error("Firehose timed out, restarting");
            lastEventTime = new Date().getTime();
            firehoseClient.close();
        }
    }, 2000);

    // Push messaging queue
    setInterval(() => {
        const queueCopy = [...queue];
        queue.length = 0;
        for (const notification of queueCopy) {
            const data = { ...notification } as any;
            delete data.tokens;
            for (const token of notification.tokens) {
                try {
                    numPushMessages++;
                    pushService
                        .send({ token, data })
                        .then(() => {
                            console.log("Sent " + JSON.stringify(notification));
                        })
                        .catch((reason) => {
                            console.error("Couldn't send notification, removing token", reason);
                            registrations.remove(notification.toDid, token);
                        });
                } catch (e) {}
            }
        }
    }, 2000);

    app.get("/api/register", async (req, res) => {
        try {
            const token = req.query.token;
            const did = req.query.did;
            if (!token || !did || token.length == 0 || did.length == 0 || typeof token != "string" || typeof did != "string") {
                console.error("Invalid token or did, token: " + token + ", did: " + did);
                res.status(400).send();
                return;
            }
            console.log("Registration: " + token + ", " + did);
            registrations.add(did, token);
            console.log(`${did}: ${registrations.get(did)?.length} tokens`);
            res.send();
        } catch (e) {
            res.status(400).json(e);
        }
    });

    app.get("/api/unregister", async (req, res) => {
        try {
            const token = req.query.token;
            const did = req.query.did;
            if (
                !token ||
                !did ||
                token.length == 0 ||
                did.length == 0 ||
                typeof token != "string" ||
                typeof did != "string" ||
                !registrations.has(did)
            ) {
                console.error("Invalid token or did, or token not registered. token: " + token + ", did: " + did);
                res.status(400).send();
                return;
            }
            registrations.remove(did, token);
            console.log(`Removed token for ${did}: ${registrations.get(did)?.length} tokens`);
            res.send();
        } catch (e) {
            res.status(400).json(e);
        }
    });

    app.get("/api/status", (req, res) => {
        try {
            const regs: Record<string, number> = {};
            for (const did of registrations.keys()) {
                regs[did] = registrations.get(did)?.length || 0;
            }

            const uptime = getTimeDifference(serverStart.getTime());
            const memory = process.memoryUsage();
            memory.heapTotal /= 1024 * 1024;
            memory.heapUsed /= 1024 * 1024;
            res.json({
                serverStart,
                uptime,
                queue,
                registrations: regs,
                isStreaming,
                numStreamEvents,
                numStreamEventsPerSecond: numStreamEvents / ((performance.now() - streamStartNano) / 1000),
                numStreamRestarts,
                streamErrors,
                numPushMessages,
                numQuotes,
                numQuotedPosts: quotes.keys().length,
                quotesFileSize: formatFileSize(fsSync.statSync(quotesFile).size),
                registrationsFileSize: formatFileSize(fsSync.statSync(registrationsFile).size),
                numDidWebRequests,
                numHtmlRequests,
                memoryUsage: memory.heapUsed.toFixed(2) + " / " + memory.heapTotal.toFixed(2) + " MB",
                cpuUsage: process.cpuUsage(),
            });
        } catch (e) {
            res.status(400).json(e);
        }
    });

    app.get("/api/numquotes", (req, res) => {
        try {
            const uris: string[] | string = req.query.uri as string[] | string;
            const quotesPerUri: Record<string, number> = {};
            if (Array.isArray(uris)) {
                uris.forEach((uri) => {
                    quotesPerUri[uri] = quotes.get(uri)?.length ?? 0;
                });
            } else if (uris) {
                quotesPerUri[uris] = quotes.get(uris)?.length ?? 0;
            }
            res.json(quotesPerUri);
        } catch (e) {
            res.status(400).json(e);
        }
    });

    app.get("/api/quotes", (req, res) => {
        try {
            res.json(quotes.get(req.query.uri as string) ?? []);
        } catch (e) {
            res.status(400).json(e);
        }
    });

    app.get("/api/resolve-did-web", async (req, res) => {
        numDidWebRequests++;
        try {
            const did = req.query.did as string;
            if (!did.startsWith("did:web:")) {
                res.status(400).json({ error: "Not a did:web" });
                return;
            }
            const didDocUrl = "https://" + did.replace("did:web:", "") + "/.well-known/did.json";
            const response = await fetch(didDocUrl);
            if (!response.ok) {
                res.status(400).json({ error: "Couldn't fetch did.json" });
                return;
            }
            res.json(await response.json());
        } catch (e) {
            res.status(400).json(e);
        }
    });

    app.get("/api/resolve-blob", async (req, res) => {
        numDidWebRequests++;
        try {
            const response = await fetch(req.query.url as string);
            if (!response.ok) {
                res.status(400).json({ error: `Couldn't retrieve ${req.query.url}` });
                return;
            }

            res.setHeader("Content-Type", response.headers.get("content-type") || "application/octet-stream");
            const buffer = await response.arrayBuffer();
            const nodeBuffer = Buffer.from(buffer);
            res.send(nodeBuffer);
        } catch (e) {
            res.status(400).json({ error: "An error occurred" });
        }
    });

    app.get("/api/html", async (req, res) => {
        numHtmlRequests++;
        try {
            const url = req.query.url as string;
            const response = await fetch(url);
            if (!response.ok) {
                res.status(400).json({ error: "Couldn't fetch " + url });
                return;
            }
            res.send(await response.text());
        } catch (e) {
            res.status(400).json(e);
        }
    });

    http.createServer(app).listen(port, () => {
        console.log(`App listening on port ${port}`);
    });
})();
