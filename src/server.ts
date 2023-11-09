import compression from "compression";
import express from "express";
import * as http from "http";
import cors from "cors";
import * as admin from "firebase-admin";
import { applicationDefault } from "firebase-admin/app";
import { ComAtprotoSyncSubscribeRepos, SubscribeReposMessage, subscribeRepos } from "atproto-firehose";
import { AppBskyEmbedRecord, AppBskyFeedPost } from "@atproto/api";

type Notification = { type: "like" | "reply" | "quote" | "repost" | "follow"; fromDid: string; toDid: string; token: string };

const port = process.env.PORT ?? 3333;
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log("Please set GOOGLE_APPLICATION_CREDENTIALS to the file path of your Firebase service credentials file.");
    process.exit(-1);
}
const registrations: Record<string, string> = {};
let pushService: admin.messaging.Messaging;

(async () => {
    const app = express();
    app.use(cors());
    app.use(compression());
    app.use(express.static("./"));

    try {
        const app = admin.initializeApp({ credential: applicationDefault() });
        pushService = app.messaging();
    } catch (e) {
        console.error("Couldn't initialize push service.", e);
        process.exit(-1);
    }

    const client = subscribeRepos(`wss://bsky.social`, { decodeRepoOps: true });

    const queue: Notification[] = [];
    client.on("message", (message: SubscribeReposMessage) => {
        if (ComAtprotoSyncSubscribeRepos.isCommit(message)) {
            message.ops.forEach((op) => {
                const from = message.repo;
                const payload = op.payload as any;
                switch (payload?.$type) {
                    case "app.bsky.feed.like":
                        if (payload.subject?.uri) {
                            const to = payload.subject.uri.replace("at://", "").split("/")[0];
                            const token = registrations[to];
                            if (token && from != to) {
                                queue.push({ type: "like", fromDid: from, toDid: to, token });
                            }
                        }
                        break;
                    case "app.bsky.feed.post":
                        if (AppBskyFeedPost.isRecord(payload)) {
                            if (from == "did:plc:7syfakzcriq44mwbdbc7jwvn") {
                                console.log("");
                            }
                            if (payload.reply) {
                                if (payload.reply) {
                                    let uri;
                                    if (payload.reply.parent) {
                                        uri = payload.reply.parent.uri;
                                    } else {
                                        uri = payload.reply.root?.uri;
                                    }
                                    if (uri) {
                                        const to = uri.replace("at://", "").split("/")[0];
                                        const token = registrations[to];
                                        if (token && from != to) {
                                            queue.push({ type: "reply", fromDid: from, toDid: to, token });
                                        }
                                    }
                                }
                            }

                            if (payload.embed) {
                                if (AppBskyEmbedRecord.isMain(payload.embed)) {
                                    const to = payload.embed.record.uri.replace("at://", "").split("/")[0];
                                    const token = registrations[to];
                                    if (token && from != to) {
                                        queue.push({ type: "quote", fromDid: from, toDid: to, token });
                                    }
                                }
                            }
                        }
                        break;
                    case "app.bsky.feed.repost":
                        if (payload.subject?.uri) {
                            const to = payload.subject.uri.replace("at://", "").split("/")[0];
                            const token = registrations[to];
                            if (token && from != to) {
                                queue.push({ type: "repost", fromDid: from, toDid: to, token });
                            }
                        }
                        break;
                    case "app.bsky.graph.follow":
                        if (payload.subject?.uri) {
                            const to = payload.subject.replace("at://", "").split("/")[0];
                            const token = registrations[to];
                            if (token && from != to) {
                                queue.push({ type: "follow", fromDid: from, toDid: to, token });
                            }
                        }
                        break;
                }
            });
        }
    });

    setInterval(() => {
        const queueCopy = [...queue];
        queue.length = 0;
        for (const notification of queueCopy) {
            const data = { ...notification } as any;
            delete data.token;
            pushService
                .send({ token: notification.token, data })
                .then(() => {
                    console.log("Sent " + JSON.stringify(notification));
                })
                .catch((reason) => {
                    console.error("Couldn't send notification", reason);
                });
        }
    }, 2000);

    app.get("/api/register", async (req, res) => {
        const token = req.query.token;
        const did = req.query.did;
        if (!token || !did || token.length == 0 || did.length == 0 || typeof token != "string" || typeof did != "string") {
            console.error("Invalid token or did, token: " + token + ", did: " + did);
            res.status(400).send();
            return;
        }
        console.log("Registration: " + token + ", " + did);
        registrations[did] = token;
        res.send();
    });

    http.createServer(app).listen(port, () => {
        console.log(`App listening on port ${port}`);
    });
})();
