import { AppBskyFeedDefs, AppBskyFeedPost, AppBskyNotificationListNotifications } from "@atproto/api";
import { FeedViewPost, PostView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";

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
