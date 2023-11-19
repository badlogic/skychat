import { AppBskyFeedDefs, AppBskyFeedPost, AtpSessionData, AtpSessionEvent, BskyAgent } from "@atproto/api";
import { FeedViewPost } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import * as fs from "fs";

const user = "badlogic.bsky.social";
const password = process.env.BADLOGIC_BSKY_PASSWORD!;

export function getDateString(inputDateTime: Date): string {
    const hours = inputDateTime.getHours();
    const minutes = inputDateTime.getMinutes();
    const seconds = inputDateTime.getSeconds();

    const paddedHours = String(hours).padStart(2, "0");
    const paddedMinutes = String(minutes).padStart(2, "0");
    const paddedSeconds = String(seconds).padStart(2, "0");

    const year = inputDateTime.getFullYear();
    const month = new String(inputDateTime.getMonth() + 1).padStart(2, "0");
    const day = new String(inputDateTime.getDate()).padStart(2, "0");

    return `${paddedHours}:${paddedMinutes}:${paddedSeconds} ${year}-${month}-${day}`;
}

const login = async () => {
    let session: AtpSessionData | undefined = fs.existsSync("session.json") ? JSON.parse(fs.readFileSync("session.json", "utf-8")) : undefined;
    const client = new BskyAgent({
        service: "https://bsky.social",
        persistSession: (evt: AtpSessionEvent, sessionData?: AtpSessionData) => {
            if (evt == "create" || evt == "update") {
                session = sessionData;
                fs.writeFileSync("session.json", JSON.stringify(session, null, 2));
                console.log("Persisted session");
            }
        },
    });
    let loggedIn = false;
    if (session) {
        if ((await client.resumeSession(session)).success) {
            console.log("Logged in via session.");
            loggedIn = true;
            return client;
        }
    }
    if (!loggedIn) {
        const loginResp = await client.login({ identifier: user, password: password });
        if (!loginResp.success) {
            console.error("Couldn't log in", loginResp);
            process.exit(-1);
        }
        console.log("Logged in via user/password");
    }
    return client;
};

const author = (post: FeedViewPost) => {
    return post.post.author.displayName ?? post.post.author.handle;
};

const date = (post: FeedViewPost) => {
    let rec = record(post);
    if (post.reason && AppBskyFeedDefs.isReasonRepost(post.reason)) return new Date(post.reason.indexedAt);
    return rec?.createdAt ? new Date(rec.createdAt) : undefined;
};

const record = (post: FeedViewPost) => {
    return AppBskyFeedPost.isRecord(post.post.record) ? post.post.record : undefined;
};

const text = (post: FeedViewPost) => {
    const rec = record(post);
    return rec?.text;
};

const printPage = (page: FeedViewPost[]) => {
    for (const post of page) {
        const rec = record(post);
        console.log((post.reason ? "RP " : "   ") + getDateString(date(post) ?? new Date()) + " " + author(post));
        console.log("       text: " + text(post)?.substring(0, 50).replace("\n", " ")) + " ...";
        console.log("       cid:  " + post.post.cid);
        console.log();
    }
    console.log();
};

const loadPosts = async (client: BskyAgent, cursor?: string, limit = 25) => {
    let resp = await client?.getTimeline({ cursor, limit });
    if (!resp?.success) {
        console.error("Couldn't fetch timeline", resp);
        process.exit(-1);
    }
    return resp.data;
};

const getPostKey = (post: FeedViewPost) => {
    return post.post.uri + (AppBskyFeedDefs.isReasonRepost(post.reason) ? ":" + post.reason.by.did : "");
};

const fortyEightHours = 48 * 60 * 60 * 1000;
const loadNewerPosts = async (
    client: BskyAgent,
    startCid: string,
    startTimestamp: number,
    seenPostKeys: Set<string>,
    minNumPosts = 5,
    maxTimeDifference = fortyEightHours
): Promise<{ posts: FeedViewPost[]; numRequests: number; exceededMaxTimeDifference: boolean }> => {
    let timeIncrement = 15 * 60 * 1000;
    let time = startTimestamp + timeIncrement;
    let cid = startCid;
    let newPosts: FeedViewPost[] = [];
    let lastCursor: string | undefined;
    let foundSeenPost = false;
    let numRequests = 0;
    let seenNewPosts = new Set<string>();
    let exceededMaxTimeDifference = false;

    // Fetch the latest posts and see if its our latest post.
    const response = await loadPosts(client, undefined, 1);
    numRequests++;
    if (response.feed[0].post.cid == startCid) return { posts: [], numRequests, exceededMaxTimeDifference: false };

    // Adjust maxTimeDifference down if possible, results in fewer fetches.
    maxTimeDifference = Math.min(maxTimeDifference, date(response.feed[0])!.getTime() - startTimestamp);
    if (maxTimeDifference < 0) maxTimeDifference = fortyEightHours;

    // FIrst pass, try to collect minNumPosts new posts. This may overshoot, so there's
    // a gap between the startPost and the last post in newPosts. We'll resolve the missing
    // posts in the next loop below.
    while (true) {
        const response = await loadPosts(client, time + "::" + cid);
        lastCursor = response.cursor;
        const fetchedPosts = response.feed;
        let uniquePosts = fetchedPosts.filter((post) => !seenPostKeys.has(getPostKey(post)) && (date(post)?.getTime() ?? 0) > startTimestamp);
        uniquePosts = uniquePosts.filter((post) => !seenNewPosts.has(getPostKey(post)));
        uniquePosts.forEach((post) => seenNewPosts.add(getPostKey(post)));
        foundSeenPost = fetchedPosts.some((post) => seenPostKeys.has(getPostKey(post)));
        numRequests++;
        // If we haven't found any new posts, we need to look further into the future
        // but not too far.
        if (uniquePosts.length == 0) {
            foundSeenPost = false;
            timeIncrement *= 1.75; // Make us jump a little further than last time
            time += timeIncrement;
            // If we searched to far into the future, give up
            if (time - startTimestamp > maxTimeDifference) {
                exceededMaxTimeDifference = seenNewPosts.size > 0;
                break;
            }
            continue;
        }

        // If we found minNumPosts, we don't need to load any more posts
        // We might end up having to load older posts though, until we
        // find a seen post.
        newPosts = [...uniquePosts, ...newPosts];
        if (newPosts.length >= minNumPosts) break;
    }

    // There's a gap between the new posts and the start post. Resolve
    // the posts in-between.
    if (!foundSeenPost && newPosts.length > 0) {
        while (!foundSeenPost) {
            const response = await loadPosts(client, lastCursor);
            lastCursor = response.cursor;
            const fetchedPosts = response.feed;
            const uniquePosts = fetchedPosts.filter((post) => !seenPostKeys.has(getPostKey(post)) && (date(post)?.getTime() ?? 0) > startTimestamp);
            newPosts = [...newPosts, ...uniquePosts];
            foundSeenPost = fetchedPosts.some((post) => seenPostKeys.has(getPostKey(post)));
            numRequests++;
        }
    }

    return { posts: newPosts, numRequests, exceededMaxTimeDifference };
};

(async () => {
    const client = await login();
    let cursor: string | undefined = undefined;

    // 4 pages, 25 posts each as the ground truth
    const posts: FeedViewPost[] = [];
    for (let i = 0; i < 4; i++) {
        console.log("Cursor: " + cursor);
        const timeline = await loadPosts(client, cursor, 25);
        printPage(timeline.feed);
        cursor = timeline.cursor;
        posts.push(...timeline.feed);
    }

    // Reconstruct all newer posts starting at a random older post.
    let startIndex = (Math.min(1, 1 - Math.random() * 0.1) * posts.length - 1) | 0;

    while (startIndex > 0) {
        const startPost = posts[startIndex];
        console.log("Start post");
        printPage([startPost]);

        // Register all posts with their unique key. Replies/top-post keys
        // are the posts uri, reposts are the post uri + reposter did.
        const seenPostKeys = new Set<string>();
        for (let i = startIndex; i < posts.length; i++) {
            seenPostKeys.add(getPostKey(posts[i]));
        }

        const start = performance.now();
        const newPosts = await loadNewerPosts(client, startPost.post.cid, date(startPost)!.getTime(), seenPostKeys, 5);
        const took = ((performance.now() - start) / 1000).toFixed(2) + " secs";
        console.log("Fetched " + newPosts.posts.length + " newer posts, " + newPosts.numRequests + " request");
        printPage(newPosts.posts);

        // Compare with expected results
        for (let i = startIndex - 1, j = newPosts.posts.length - 1; i >= 0 && j >= 0; i--, j--) {
            const knownKey = getPostKey(posts[i]);
            const newKey = getPostKey(newPosts.posts[j]);
            if (knownKey != newKey) {
                console.error("Mismatch found!");
            }
        }
        console.log("Fetched " + newPosts.posts.length + " newer posts, " + newPosts.numRequests + " requests");
        console.log("Took " + took);

        if (newPosts.posts.length == 0) break;
        startIndex -= newPosts.posts.length;
    }
    console.log("All newer posts found. It works!");
})();
