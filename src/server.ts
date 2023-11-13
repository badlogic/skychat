import compression from "compression";
import express from "express";
import * as http from "http";
import cors from "cors";
import * as admin from "firebase-admin";
import { applicationDefault } from "firebase-admin/app";
import { ComAtprotoSyncSubscribeRepos, SubscribeReposMessage, subscribeRepos } from "atproto-firehose";
import { AppBskyEmbedRecord, AppBskyFeedPost } from "@atproto/api";
import { formatFileSize, getTimeDifference, splitAtUri } from "./utils";
import * as fs from "fs/promises";
import * as fsSync from "fs";

type Notification = { type: "like" | "reply" | "quote" | "repost" | "follow"; fromDid: string; toDid: string; tokens: string[]; postUri?: string };

const port = process.env.PORT ?? 3333;
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log("Please set GOOGLE_APPLICATION_CREDENTIALS to the file path of your Firebase service credentials file.");
    process.exit(-1);
}

if (!fsSync.existsSync("data")) {
    fsSync.mkdirSync("data");
}

const registrationsFile = "data/registrations.json";
const quotesFile = "data/quotes.json";

const quotes: Record<string, string[]> = fsSync.existsSync(quotesFile) ? JSON.parse(fsSync.readFileSync(quotesFile, "utf8")) : {};
const registrations: Record<string, string[]> = fsSync.existsSync(registrationsFile)
    ? JSON.parse(fsSync.readFileSync(registrationsFile, "utf8"))
    : {};
const queue: Notification[] = [];
const streamErrors: { code: string; reason: string; date: string; postUri?: string }[] = [];

let serverStart = new Date();
let streamStartNano = performance.now();
let isStreaming = false;
let numStreamEvents = 0;
let numStreamRestarts = 0;
let numPushMessages = 0;
let numQuotes = 0 + 0;
for (const quote in quotes) {
    numQuotes += quotes[quote].length;
}
let numSaves = 0;
let saveTime = 0;
let numDidWebRequests = 0;

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
                                const tokens = registrations[to];
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
                                            const tokens = registrations[to];
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
                                        const tokens = registrations[to];
                                        if (tokens && from != to) {
                                            queue.push({ type: "quote", fromDid: from, toDid: to, tokens, postUri });
                                        }

                                        let quotingPosts = quotes[postUri];
                                        if (!quotingPosts) {
                                            quotes[postUri] = quotingPosts = [];
                                        }
                                        quotingPosts.push("at://" + from + "/" + op.path);
                                        numQuotes++;
                                    }
                                }
                            }
                            break;
                        case "app.bsky.feed.repost":
                            if (payload.subject?.uri) {
                                const to = splitAtUri(payload.subject.uri).repo;
                                postUri = payload.subject.uri;
                                const tokens = registrations[to];
                                if (tokens && from != to) {
                                    queue.push({ type: "repost", fromDid: from, toDid: to, tokens, postUri });
                                }
                            }
                            break;
                        case "app.bsky.graph.follow":
                            if (payload.subject?.uri) {
                                const to = splitAtUri(payload.subject).repo;
                                const tokens = registrations[to];
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

    const setupStream = () => {
        numStreamRestarts++;
        console.log("(Re-)starting stream");
        let client = subscribeRepos(`wss://bsky.network`, { decodeRepoOps: true });
        client.on("message", onMessage);
        client.on("error", (code, reason) => {
            streamErrors.push({ date: new Date().toString(), code, reason });
            try {
                client.close();
            } catch (e) {}
            setupStream();
        });
        client.on("close", () => setupStream());
    };
    setupStream();

    // Persistance task
    setInterval(async () => {
        const safeWriteFile = async (targetPath: string, data: string): Promise<void> => {
            const tempPath = targetPath + ".tmp";
            const start = performance.now();
            try {
                await fs.writeFile(tempPath, data);
                await fs.rename(tempPath, targetPath);
            } catch (error) {
                console.error("Error writing file: " + targetPath, error);
            }
            saveTime = (performance.now() - start) / 1000;
        };

        await safeWriteFile(registrationsFile, JSON.stringify(registrations, null, 2));
        await safeWriteFile(quotesFile, JSON.stringify(quotes, null, 2));
        numSaves++;
    }, 10000);

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
                            registrations[notification.toDid] = registrations[notification.toDid].filter((regToken) => regToken != token);
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
            const tokens = registrations[did] ?? [];
            if (tokens.indexOf(token) == -1) tokens.push(token);
            registrations[did] = tokens;
            console.log(`${did}: ${tokens.length} tokens`);
            res.send();
        } catch (e) {
            res.status(400).json(e);
        }
    });

    app.get("/api/unregister", async (req, res) => {
        try {
            const token = req.query.token;
            const did = req.query.did;
            if (!token || !did || token.length == 0 || did.length == 0 || typeof token != "string" || typeof did != "string" || !registrations[did]) {
                console.error("Invalid token or did, or token not registered. token: " + token + ", did: " + did);
                res.status(400).send();
                return;
            }
            registrations[did] = registrations[did].filter((regToken) => regToken != token);
            console.log(`Removed token for ${did}: ${registrations[did].length} tokens`);
            res.send();
        } catch (e) {
            res.status(400).json(e);
        }
    });

    app.get("/api/status", (req, res) => {
        try {
            const regs: Record<string, number> = {};
            for (const did in registrations) {
                regs[did] = registrations[did].length;
            }

            const uptime = getTimeDifference(serverStart.getTime());
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
                numQuotedPosts: Object.keys(quotes).length,
                numSaves,
                saveTime: saveTime.toFixed(2) + " secs",
                quotesFileSize: formatFileSize(fsSync.statSync(quotesFile).size),
                registrationsFileSize: formatFileSize(fsSync.statSync(registrationsFile).size),
                numDidWebRequests,
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
                    quotesPerUri[uri] = quotes[uri]?.length ?? 0;
                });
            } else if (uris) {
                quotesPerUri[uris] = quotes[uris]?.length ?? 0;
            }
            res.json(quotesPerUri);
        } catch (e) {
            res.status(400).json(e);
        }
    });

    app.get("/api/quotes", (req, res) => {
        try {
            res.json(quotes[req.query.uri as string] ?? []);
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

    http.createServer(app).listen(port, () => {
        console.log(`App listening on port ${port}`);
    });
})();
