import { BskyAgent } from "@atproto/api";
import { ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs";

export const profileCache: Record<string, ProfileViewDetailed> = {};
export async function cacheProfile(bskyClient: BskyAgent, did: string) {
    if (!profileCache[did]) {
        const profile = await bskyClient.app.bsky.actor.getProfile({ actor: did });
        if (profile?.success) {
            profileCache[did] = profile.data;
        }
    }
}
