const atproto = require("@atproto/api");

const handle = process.argv[2];
const password = process.argv[3];

(async () => {
    let session;
    const persistSession = (evt, s) => {
        if (evt == "create" || evt == "update") {
            session = s;
            console.log("Persisted session");
        }
    };
    let bskyClient = new atproto.BskyAgent({ service: "https://bsky.social", persistSession });
    let response = await bskyClient.login({ identifier: handle, password });
    if (!response.success) {
        console.error("Couldn't log in.");
        process.exit(-1);
    }
    try {
        response = await bskyClient.api.com.atproto.repo.listRecords({ repo: "caro234.bsky.social", collection: "app.bsky.feed.like" });
        if (!response.sucess) {
            console.error("Couldn't list record  app.bsky.feed.like for caro234.bsky.social after login()");
            process.exit(-1);
        }
        console.log("Got record app.bsky.feed.like for caro234.bsky.social after login()");
    } catch (e) {
        console.error("Exception: Couldn't list record  app.bsky.feed.like for caro234.bsky.social after login()\n", e);
    }

    bskyClient = new atproto.BskyAgent({ service: "https://bsky.social", persistSession });
    await bskyClient.resumeSession(session);
    console.log("Resumed session");
    response = await bskyClient.api.com.atproto.repo.listRecords({ repo: "caro234.bsky.social", collection: "app.bsky.feed.like" });
    if (!response.success) {
        console.error("Couldn't list record  app.bsky.feed.like for caro234.bsky.social after resumeSession()");
    }
    console.log("Got record app.bsky.feed.like for caro234.bsky.social after resumeSession()");
    console.log("Logged in user " + handle);
})();
