import { Firehose, FirehoseEvent } from "./firehose";
import { CachingIdToStringsStore, CompressingIdToStringsStore, FileIdToStringsStore } from "./keyvalue-store";

const quotesFile = "docker/data/quotes.kvdb";

const compressAtUri = (v: string, isKey: boolean) => {
    return v.replace("at://", "").replace("app.bsky.feed.post/", "");
};
const uncompressAtUri = (v: string, isKey: boolean) => {
    const tokens = v.split("/");
    if (tokens.length == 2) return "at://" + tokens[0] + "/app.bsky.feed.post/" + tokens[1];
    return "at://" + v;
};

const quotes = new CompressingIdToStringsStore(new CachingIdToStringsStore(new FileIdToStringsStore(quotesFile)), compressAtUri, uncompressAtUri);

export async function initializeQuotes(firehose: Firehose) {
    await quotes.initialize();
    console.log("Initialized quotes");
    const stats = {
        numQuotes: 0,
    };
    firehose.listeners.push((event: FirehoseEvent) => {
        if (event.type == "quote") {
            quotes.add(event.quotedUri, event.postUri);
            stats.numQuotes++;
        }
    });

    return {
        stats,
        store: quotes,
    };
}
