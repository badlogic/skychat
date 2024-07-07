import { AtpSessionData, AtpSessionEvent, BskyAgent } from "@atproto/api";
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

(async () => {
    const client = await login();

    /*const response = await client.com.atproto.repo.listRecords({ collection: "app.bsky.actor.profile", repo: user });
    if (!response.success) {
        console.error("Couldn't get records", response);
    }

    (response.data.records[0] as any).skysocial = { hello: "test" };

    const mutedThreads: string[] = [];
    for (let i = 0; i < 1300; i++) {
        mutedThreads.push("at://did:plc:7syfakzcriq44mwbdbc7jwvn/app.bsky.feed.post/3kej2se3eoc2h");
    }

    const backup: any = {
        $type: "app.bsky.actor.profile",
        description:
            'Bekannt aus dem Österreichischen Parlament und National Bibliothek, "Hacktivist", Computer dies das\n\nhttps://cards-for-ukraine.at\n\nhttps://www.wired.com/story/heisse-preise-food-prices/\n\n@badlogic@mastodon.gamedev.place\n\nhttps://marioslab.io',
        displayName: "Mario Zechner",
    };

    const putResponse = await client.com.atproto.repo.putRecord({
        collection: "app.bsky.actor.profile",
        repo: user,
        rkey: "self",
        swapRecord: response.data.records[0].cid,
        record: {
            ...response.data.records[0].value,
            "social.skychat.settings": {
                theme: "dark",
            },
        },
    });
    if (!putResponse.success) {
        console.error("Coudln't put record", putResponse);
    }*/

    const generateRandomString = (length: number): string => {
        let result = "";
        const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (let i = 0; i < length; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return result;
    };

    const prefs = await client.app.bsky.actor.getPreferences();
    prefs.data.preferences = prefs.data.preferences.filter((pref) => pref.$type != "app.bsky.skychat.settings");
    prefs.data.preferences.push({
        $type: "app.bsky.skychat.settings",
        test: generateRandomString(100000),
    });
    console.log(await client.app.bsky.actor.putPreferences({ preferences: prefs.data.preferences }));
    console.log((await client.app.bsky.actor.getPreferences()).data.preferences);
})();
