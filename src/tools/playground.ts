import { BskyAgent } from "@atproto/api";
import { Repo } from "@atproto/api/dist/client/types/com/atproto/sync/listRepos";
import * as fs from "fs";

const client = new BskyAgent({ service: "https://bsky.social" });

let cursor: string | undefined;

let repos: Repo[] = new Array();
(async () => {
    while (true) {
        const response = await client.com.atproto.sync.listRepos({ limit: 1000, cursor });
        if (!response.success) {
            console.error("Couldn't list repos");
        }
        repos.push(...response.data.repos);
        console.log("Fetched " + repos.length + " repos");
        if (response.data.repos.length == 0) {
            console.log("Dumping repos to repos.json");
            fs.writeFileSync("repos.json", JSON.stringify(repos, null, 2));
            console.log(`Done, ${repos.length} repos`);
            process.exit(0);
        }
        cursor = response.data.cursor;
    }
})();
