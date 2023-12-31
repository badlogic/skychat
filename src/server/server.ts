import compression from "compression";
import cors from "cors";
import express from "express";
import * as http from "http";
import { getTimeDifference } from "../utils";
import { Firehose } from "./firehose";
import { initializePushNotifications } from "./pushnotifications";
import { initializeQuotes } from "./quotes";
import WebSocket, { WebSocketServer } from "ws";
import * as chokidar from "chokidar";

const port = process.env.PORT ?? 3333;
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log("Please set GOOGLE_APPLICATION_CREDENTIALS to the file path of your Firebase service credentials file.");
    process.exit(-1);
}

let serverStart = new Date();
let numDidWebRequests = 0;
let numHtmlRequests = 0;

(async () => {
    const app = express();
    app.set("json spaces", 2);
    app.use(cors());
    app.use(compression());
    app.use(express.static("./"));

    const firehose = new Firehose();
    const pushNotifications = await initializePushNotifications(firehose);
    const quotes = await initializeQuotes(firehose);
    firehose.start();

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
            pushNotifications.registrations.add(did, token);
            console.log(`${did}: ${(await pushNotifications.registrations.get(did))?.length} tokens`);
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
                !pushNotifications.registrations.has(did)
            ) {
                console.error("Invalid token or did, or token not registered. token: " + token + ", did: " + did);
                res.status(400).send();
                return;
            }
            pushNotifications.registrations.remove(did, token);
            console.log(`Removed token for ${did}: ${(await pushNotifications.registrations.get(did))?.length} tokens`);
            res.send();
        } catch (e) {
            res.status(400).json(e);
        }
    });

    app.get("/api/status", async (req, res) => {
        try {
            const regs: Record<string, number> = {};
            for (const did of await pushNotifications.registrations.keys()) {
                regs[did] = (await pushNotifications.registrations.get(did))?.length || 0;
            }

            const uptime = getTimeDifference(serverStart.getTime());
            const memory = process.memoryUsage();
            memory.heapTotal /= 1024 * 1024;
            memory.heapUsed /= 1024 * 1024;
            res.json({
                serverStart,
                uptime,
                registrations: regs,
                firehoseStats: {
                    ...firehose.stats,
                    numStreamEventsPerSecond: firehose.stats.numStreamEvents / ((performance.now() - firehose.stats.streamStartNano) / 1000),
                },
                pushNotificationStats: pushNotifications.stats,
                quotesStats: quotes.stats,
                numDidWebRequests,
                numHtmlRequests,
                memoryUsage: memory.heapUsed.toFixed(2) + " / " + memory.heapTotal.toFixed(2) + " MB",
            });
        } catch (e) {
            res.status(400).json(e);
        }
    });

    app.get("/api/numquotes", async (req, res) => {
        try {
            const uris: string[] | string = req.query.uri as string[] | string;
            const quotesPerUri: Record<string, number> = {};
            if (Array.isArray(uris)) {
                for (const uri of uris) {
                    quotesPerUri[uri] = (await quotes.store.get(uri))?.length ?? 0;
                }
            } else if (uris) {
                quotesPerUri[uris] = (await quotes.store.get(uris))?.length ?? 0;
            }
            res.json(quotesPerUri);
        } catch (e) {
            res.status(400).json(e);
        }
    });

    app.get("/api/quotes", async (req, res) => {
        try {
            res.json((await quotes.store.get(req.query.uri as string)) ?? []);
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

    const server = http.createServer(app);
    server.listen(port, () => {
        console.log(`App listening on port ${port}`);
    });

    setupLiveReload(server);

    function setupLiveReload(server: http.Server) {
        // Set up WebSocket server
        const wss = new WebSocketServer({ server });

        // Store all connected clients
        const clients: Set<WebSocket> = new Set();

        // Handle new WebSocket connections
        wss.on("connection", (ws: WebSocket) => {
            clients.add(ws);
            ws.on("close", () => {
                clients.delete(ws);
            });
        });

        // Watch the 'html/' directory for changes
        chokidar.watch("html/", { ignored: /(^|[\/\\])\../, ignoreInitial: true }).on("all", (event, path) => {
            // Inform all connected WebSocket clients
            clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(`File changed: ${path}`);
                }
            });
        });

        console.log("Initialized live-reload");
    }
})();
