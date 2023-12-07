import { html } from "lit";
import { FeedOverlay, ListEditor, ListMembersOverlay, ListOverlay, ListPicker, ProfileOverlay, ThreadOverlay } from ".";
import { dom, splitAtUri, combineAtUri } from "../utils";
import { i18n } from "../i18n";
import { FollowersStream, FollowingStream, PostLikesStream, PostRepostsStream } from "../streams";
import { DidResolver } from "@atproto/identity";
import { State } from "../state";

async function fromBlueSkyLink(hash: string) {
    // Allow BlueSky links directly
    if (hash.startsWith("https://bsky.app/profile/")) {
        if (hash.includes("/post/")) {
            hash = "thread/" + hash.replaceAll("https://bsky.app/profile/", "").replace("post/", "");
        }
        if (hash.includes("/profile/") && hash.split("/").length == 5) {
            const atUri = splitAtUri(hash.replaceAll("https://bsky.app/profile/", ""));
            let did = atUri.repo;
            if (!atUri.repo.startsWith("did:")) {
                const response = await State.bskyClient!.app.bsky.actor.getProfile({ actor: did });
                did = response.data.did;
            }
            hash = "profile/" + did;
        }
        if (hash.includes("/lists/")) {
            const atUri = splitAtUri(hash.replaceAll("https://bsky.app/profile/", ""));
            let did = atUri.repo;
            if (!atUri.repo.startsWith("did:")) {
                const response = await State.bskyClient!.app.bsky.actor.getProfile({ actor: did });
                did = response.data.did;
            }
            hash = "list/" + did + "/" + atUri.rkey;
        }

        if (hash.includes("/feed/")) {
            const atUri = splitAtUri(hash.replaceAll("https://bsky.app/profile/", ""));
            let did = atUri.repo;
            if (!atUri.repo.startsWith("did:")) {
                const response = await State.bskyClient!.app.bsky.actor.getProfile({ actor: did });
                did = response.data.did;
            }
            hash = "feed/" + did + "/" + atUri.rkey;
        }
    }

    return hash;
}

export async function routeHash(hash: string) {
    hash = hash.replace("#", "");
    hash = await fromBlueSkyLink(hash);

    if (hash && hash.length > 0) {
        const tokens = hash.split("/");
        if (tokens.length > 0) {
            if (tokens[0] == "profile" && tokens[1]) {
                const child = document.body.children[document.body.children.length - 1];
                if (child.tagName == "PROFILE-OVERLAY") {
                    const profileOverlay = child as ProfileOverlay;
                    if (profileOverlay.did == tokens[1]) return;
                }
                document.body.append(dom(html`<profile-overlay .did=${tokens[1]} .pushState=${false}></profile-overlay>`)[0]);
                return;
            }

            if (tokens[0] == "thread" && tokens[1] && tokens[2]) {
                const child = document.body.children[document.body.children.length - 1];
                if (child.tagName == "THREAD-OVERLAY") {
                    const threadOverlay = child as ThreadOverlay;
                    const atUri = splitAtUri(threadOverlay.postUri!);
                    if (atUri.repo == tokens[1] && atUri.rkey == tokens[2]) return;
                }
                document.body.append(
                    dom(html`<thread-overlay .postUri=${combineAtUri(tokens[1], tokens[2])} .pushState=${false}></thread-overlay>`)[0]
                );
                return;
            }

            if (tokens[0] == "notifications") {
                const child = document.body.children[document.body.children.length - 1];
                if (child.tagName == "NOTIFICATIONS-STREAM-OVERLAY") return;
                document.body.append(dom(html`<notifications-stream-overlay .pushState=${false}></notifications-stream-overlay>`)[0]);
                return;
            }

            if (tokens[0] == "likes") {
                const child = document.body.children[document.body.children.length - 1];
                if (child.tagName == "PROFILES-STREAM-OVERLAY") return;
                document.body.append(
                    dom(
                        html`<profiles-stream-overlay
                            title="${i18n("Likes")}"
                            .hash=${`likes/${tokens[1]}/${tokens[2]}`}
                            .stream=${new PostLikesStream(combineAtUri(tokens[1], tokens[2]))}
                            .pushState=${false}
                        ></profiles-stream-overlay>`
                    )[0]
                );
                return;
            }

            if (tokens[0] == "reposts") {
                const child = document.body.children[document.body.children.length - 1];
                if (child.tagName == "PROFILES-STREAM-OVERLAY") return;
                document.body.append(
                    dom(
                        html`<profiles-stream-overlay
                            title="${i18n("Reposts")}"
                            .hash=${`reposts/${tokens[1]}/${tokens[2]}`}
                            .stream=${new PostRepostsStream(combineAtUri(tokens[1], tokens[2]))}
                            .pushState=${false}
                        ></profiles-stream-overlay>`
                    )[0]
                );
                return;
            }

            if (tokens[0] == "following") {
                const child = document.body.children[document.body.children.length - 1];
                if (child.tagName == "PROFILES-STREAM-OVERLAY") return;
                document.body.append(
                    dom(
                        html`<profiles-stream-overlay
                            title="${i18n("Following")}"
                            .hash=${`following/${tokens[1]}`}
                            .stream=${new FollowingStream(tokens[1])}
                            .pushState=${false}
                        ></profiles-stream-overlay>`
                    )[0]
                );
                return;
            }

            if (tokens[0] == "followers") {
                const child = document.body.children[document.body.children.length - 1];
                if (child.tagName == "PROFILES-STREAM-OVERLAY") return;
                document.body.append(
                    dom(
                        html`<profiles-stream-overlay
                            title="${i18n("Followers")}"
                            .hash=${`followers/${tokens[1]}`}
                            .stream=${new FollowersStream(tokens[1])}
                            .pushState=${false}
                        ></profiles-stream-overlay>`
                    )[0]
                );
                return;
            }

            if (tokens[0] == "settings") {
                const child = document.body.children[document.body.children.length - 1];
                if (child.tagName == "SETTINGS-OVERLAY") return;
                document.body.append(dom(html`<settings-overlay .pushState=${false}></settings-overlay>`)[0]);
                return;
            }

            if (tokens[0] == "mutedwords") {
                const child = document.body.children[document.body.children.length - 1];
                if (child.tagName == "MUTED-WORDS-OVERLAY") return;
                document.body.append(dom(html`<muted-words-overlay .pushState=${false}></muted-words-overlay>`)[0]);
                return;
            }

            if (tokens[0] == "muted") {
                const child = document.body.children[document.body.children.length - 1];
                if (child.tagName == "MUTED-USERS-OVERLAY") return;
                document.body.append(dom(html`<muted-users-overlay .pushState=${false}></muted-users-overlay>`)[0]);
                return;
            }

            if (tokens[0] == "mutedthreads") {
                const child = document.body.children[document.body.children.length - 1];
                if (child.tagName == "MUTED-THREADS-OVERLAY") return;
                document.body.append(dom(html`<muted-threads-overlay .pushState=${false}></muted-threads-overlay>`)[0]);
                return;
            }

            if (tokens[0] == "blocked") {
                const child = document.body.children[document.body.children.length - 1];
                if (child.tagName == "BLOCKED-USERS-OVERLAY") return;
                document.body.append(dom(html`<blocked-users-overlay .pushState=${false}></blocked-users-overlay>`)[0]);
                return;
            }

            if (tokens[0] == "modlists") {
                const child = document.body.children[document.body.children.length - 1];
                if (child.tagName == "LIST-PICKER" && (child as ListPicker).purpose == "moderation") return;
                document.body.append(dom(html`<list-picker .purpose=${"moderation"} .pushState=${false}></list-picker>`)[0]);
                return;
            }

            if (tokens[0] == "contentfilters") {
                const child = document.body.children[document.body.children.length - 1];
                if (child.tagName == "CONTENT-FILTERING-OVERLAY") return;
                document.body.append(dom(html`<content-filtering-overlay .pushState=${false}></content-filtering-overlay>`)[0]);
                return;
            }

            if (tokens[0] == "search") {
                const child = document.body.children[document.body.children.length - 1];
                if (child.tagName == "SEARCH-OVERLAY") return;
                document.body.append(dom(html`<search-overlay .pushState=${false}></search-overlay>`)[0]);
                return;
            }

            if (tokens[0] == "feeds") {
                const child = document.body.children[document.body.children.length - 1];
                if (child.tagName == "FEED-PICKER") return;
                document.body.append(dom(html`<feed-picker .pushState=${false}></feed-picker>`)[0]);
                return;
            }

            if (tokens[0] == "feed" && tokens[1] && tokens[2]) {
                const child = document.body.children[document.body.children.length - 1];
                const atUri = combineAtUri(tokens[1], tokens[2], "app.bsky.feed.generator");
                if (child.tagName == "FEED-OVERLAY" && (child as FeedOverlay).feedUri == atUri) return;
                document.body.append(dom(html`<feed-overlay .feedUri=${atUri} .pushState=${false}></feed-overlay>`)[0]);
                return;
            }

            if (tokens[0] == "lists") {
                const child = document.body.children[document.body.children.length - 1];
                if (child.tagName == "LIST-PICKER" && (child as ListPicker).purpose == "curation") return;
                document.body.append(dom(html`<list-picker .pushState=${false}></list-picker>`)[0]);
                return;
            }

            if (tokens[0] == "list") {
                if (tokens[1] == "new") {
                    const child = document.body.children[document.body.children.length - 1];
                    if (child.tagName == "LIST-EDITOR" && !(child as ListEditor).listUri) return;
                    document.body.append(dom(html`<list-editor .purpose=${tokens[2] ?? "curation"} .pushState=${false}></list-editor>`)[0]);
                    return;
                }

                if (tokens[1] == "edit") {
                    const child = document.body.children[document.body.children.length - 1];
                    const atUri = combineAtUri(tokens[2], tokens[3], "app.bsky.graph.list");
                    if (child.tagName == "LIST-EDITOR" && (child as ListEditor).listUri == atUri) return;
                    document.body.append(dom(html`<list-editor .listUri=${atUri} .pushState=${false}></list-editor>`)[0]);
                    return;
                }

                if (tokens[1] == "members") {
                    const child = document.body.children[document.body.children.length - 1];
                    const atUri = combineAtUri(tokens[2], tokens[3], "app.bsky.graph.list");
                    if (child.tagName == "LIST-MEMBERS-OVERLAY" && (child as ListMembersOverlay).listUri == atUri) return;
                    document.body.append(dom(html`<list-members-overlay .listUri=${atUri} .pushState=${false}></list-members-overlay>`)[0]);
                    return;
                }

                if (tokens[1] && tokens[2]) {
                    const child = document.body.children[document.body.children.length - 1];
                    const atUri = combineAtUri(tokens[1], tokens[2], "app.bsky.graph.list");
                    if (child.tagName == "LIST-OVERLAY" && (child as ListOverlay).listUri == atUri) return;
                    document.body.append(dom(html`<list-overlay .listUri=${atUri} .pushState=${false}></list-overlay>`)[0]);
                    return;
                }
            }
        }
    }
    // FIXME this doesn't work and leads to reloads
    // open notifications, close -> reload
    // location.href = "/";
}

let setup = false;
export function pushHash(hash: string) {
    if (!setup) {
        setup = true;
        window.addEventListener("hashchange", () => {
            routeHash(location.hash);
        });
    }

    if (hash.startsWith("#")) hash = hash.substring(1);
    const baseUrl = window.location.href.split("#")[0];
    history.replaceState(null, "", baseUrl + (hash.length == 0 ? "" : "#" + hash));
}
