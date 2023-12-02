import { AppBskyFeedDefs, AppBskyFeedPost, AppBskyNotificationListNotifications } from "@atproto/api";
import { FeedViewPost, GeneratorView, PostView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { splitAtUri } from "./utils.js";
import { ListView } from "@atproto/api/dist/client/types/app/bsky/graph/defs.js";
import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs.js";

export type LinkCard = {
    error: string;
    likely_type: string;
    url: string;
    title: string;
    description: string;
    image: string;
};

export async function extractLinkCard(url: string): Promise<LinkCard | Error> {
    try {
        const resp = await fetch("https://cardyb.bsky.app/v1/extract?url=" + encodeURIComponent(url));
        if (!resp.ok) throw new Error();
        return (await resp.json()) as LinkCard;
    } catch (e) {
        if (e instanceof Error) return e;
        return new Error("Couldn't get link card info from url " + url);
    }
}

export function author(post: FeedViewPost | PostView) {
    if (post.post) {
        const feedViewPost = post as FeedViewPost;
        return feedViewPost.post.author.displayName ?? feedViewPost.post.author.handle;
    } else {
        post = post as PostView;
        return post.author.displayName ?? post.author.handle;
    }
}

export function date(post: FeedViewPost | PostView | AppBskyNotificationListNotifications.Notification) {
    if (post.post) {
        const rec = record(post);
        if (post.reason && AppBskyFeedDefs.isReasonRepost(post.reason)) return new Date(post.reason.indexedAt);
        return rec?.createdAt ? new Date(rec.createdAt) : undefined;
    } else {
        const rec = record(post);
        return rec?.createdAt ? new Date(rec.createdAt) : undefined;
    }
}

export function record(post: FeedViewPost | PostView) {
    if (!post.post) {
        return AppBskyFeedPost.isRecord(post.record) ? post.record : undefined;
    } else {
        const feedViewPost = post as FeedViewPost;
        return AppBskyFeedPost.isRecord(feedViewPost.post.record) ? feedViewPost.post.record : undefined;
    }
}

export function text(post: FeedViewPost | PostView) {
    if (post.post) {
        const rec = record(post as FeedViewPost);
        return rec?.text;
    } else {
        const rec = record(post as PostView);
        return rec?.text;
    }
}

export function getBskyPostUrl(post: PostView) {
    const atUri = splitAtUri(post.uri);
    return `https://bsky.app/profile/${atUri.repo}/post/${atUri.rkey}`;
}

export function getBskyGeneratorUrl(generator: GeneratorView) {
    const atUri = splitAtUri(generator.uri);
    return `https://bsky.app/profile/${atUri.repo}/feed/${atUri.rkey}`;
}

export function getBskyListUrl(list: ListView) {
    const atUri = splitAtUri(list.uri);
    return `https://bsky.app/profile/${atUri.repo}/list/${atUri.rkey}`;
}

export function getSkychatPostUrl(post: PostView) {
    const atUri = splitAtUri(post.uri);
    return location.protocol + "//" + location.host + `/#thread/${atUri.repo}/${atUri.rkey}`;
}

export function getSkychatGeneratorUrl(generator: GeneratorView) {
    const atUri = splitAtUri(generator.uri);
    return location.protocol + "//" + location.host + `/#feed/${atUri.repo}/${atUri.rkey}`;
}

export function getSkychatListUrl(list: ListView) {
    const atUri = splitAtUri(list.uri);
    return location.protocol + "//" + location.host + `/#list/${atUri.repo}/${atUri.rkey}`;
}

export function getSkychatProfileUrl(profile: ProfileView) {
    return location.protocol + "//" + location.host + `/#profile/${profile.did}`;
}
