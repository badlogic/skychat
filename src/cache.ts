import { BskyAgent } from "@atproto/api";
import { ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { apiBaseUrl } from "./utils";

export const profileCache: Record<string, ProfileViewDetailed> = {};
export async function cacheProfile(bskyClient: BskyAgent, did: string) {
    if (!profileCache[did]) {
        const profile = await bskyClient.app.bsky.actor.getProfile({ actor: did });
        if (profile?.success) {
            profileCache[did] = profile.data;
        }
    }
}

export async function cacheProfiles(bskyClient: BskyAgent, dids: string[]) {
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
}

export const quotesCache: Record<string, number> = {};
export async function cacheQuotes(bskyClient: BskyAgent, postUris: string[]) {
    postUris = postUris.filter((uri) => quotesCache[uri] == undefined);
    if (postUris.length == 0) return;
    const params = postUris.map((uri, index) => `uri=${encodeURIComponent(uri)}&`).join("");
    const response = await fetch(apiBaseUrl() + "api/numquotes?" + params);
    if (!response.ok) {
        return;
    }
    const quotes = await response.json();
    for (const uri of postUris) {
        quotesCache[uri] = quotes[uri];
    }
}
