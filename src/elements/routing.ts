import { html } from "lit";
import { ProfileOverlay, ThreadOverlay } from ".";
import { dom, splitAtUri, combineAtUri } from "../utils";
import { i18n } from "../i18n";
import { FollowersStream, FollowingStream, PostLikesStream } from "../streams";

export async function routeHash(hash: string) {
    hash = hash.replace("#", "");

    // Allow BlueSky links directly
    if (hash.startsWith("https://bsky.app/profile/")) {
        if (hash.includes("/post/")) {
            hash = "thread/" + hash.replaceAll("https://bsky.app/profile/", "").replace("post/", "");
        }
    }

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
            }
            if (tokens[0] == "notifications") {
                const child = document.body.children[document.body.children.length - 1];
                if (child.tagName == "NOTIFICATIONS-STREAM-OVERLAY") {
                    return;
                }
                document.body.append(dom(html`<notifications-stream-overlay .pushState=${false}></notifications-stream-overlay>`)[0]);
            }
            if (tokens[0] == "likes") {
                const child = document.body.children[document.body.children.length - 1];
                if (child.tagName == "PROFILES-STREAM-OVERLAY") {
                    return;
                }
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
            }
            if (tokens[0] == "following") {
                const child = document.body.children[document.body.children.length - 1];
                if (child.tagName == "PROFILES-STREAM-OVERLAY") {
                    return;
                }
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
            }
            if (tokens[0] == "followers") {
                const child = document.body.children[document.body.children.length - 1];
                if (child.tagName == "PROFILES-STREAM-OVERLAY") {
                    return;
                }
                document.body.append(
                    dom(
                        html`<profile-stream-overlay
                            title="${i18n("Followers")}"
                            .hash=${`followers/${tokens[1]}`}
                            .stream=${new FollowersStream(tokens[1])}
                            .pushState=${false}
                        ></profiles-stream-overlay>`
                    )[0]
                );
            }
            if (tokens[0] == "settings") {
                const child = document.body.children[document.body.children.length - 1];
                if (child.tagName == "SETTINGS-OVERLAY") {
                    return;
                }
                document.body.append(dom(html`<settings-overlay .pushState=${false}></settings-overlay>`)[0]);
            }
        }
    }
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
