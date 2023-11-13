import { BskyAgent } from "@atproto/api";
import { ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { apiBaseUrl } from "./utils";

export const profileCache: Record<string, ProfileViewDetailed> = {};
export async function cacheProfile(bskyClient: BskyAgent, did: string) {
    try {
        if (!profileCache[did]) {
            const profile = await bskyClient.app.bsky.actor.getProfile({ actor: did });
            if (profile?.success) {
                profileCache[did] = profile.data;
            }
        }
    } catch (e) {
        console.error("Couldn't cache profile", e);
    }
}

export async function cacheProfiles(bskyClient: BskyAgent, dids: string[]) {
    try {
        dids = dids.filter((did) => !profileCache[did]);
        if (dids.length == 0) return;
        while (dids.length > 0) {
            const batch = dids.splice(0, 25);
            const response = await bskyClient.app.bsky.actor.getProfiles({
                actors: batch,
            });
            if (!response.success) {
                return;
            }
            for (const profile of response.data.profiles) {
                profileCache[profile.did] = profile;
            }
        }
    } catch (e) {
        console.error("Couldn't cache profiles", e);
    }
}

export const quotesCache: Record<string, number> = {};
export async function cacheQuotes(postUris: string[]) {
    try {
        postUris = postUris.filter((uri) => quotesCache[uri] == undefined);
        if (postUris.length == 0) return;
        postUris = [...postUris];
        while (postUris.length > 0) {
            const batch = postUris.splice(0, 15);
            const response = await fetch(apiBaseUrl() + "api/numquotes?" + batch.map((uri) => `uri=${encodeURIComponent(uri)}&`).join(""));
            if (!response.ok) {
                return;
            }
            const quotes = await response.json();
            for (const uri of batch) {
                quotesCache[uri] = quotes[uri];
            }
        }
    } catch (e) {
        console.error("Couldn't cache quotes", e);
    }
}
