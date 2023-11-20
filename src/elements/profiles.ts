import { RichText } from "@atproto/api";
import { ProfileView, ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { LitElement, PropertyValueMap, TemplateResult, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { Messages, i18n } from "../i18n";
import { moreIcon, spinnerIcon } from "../icons";
import { ActorFeedType, State } from "../state";
import { Store } from "../store";
import { defaultAvatar, dom, error, getNumber, getScrollParent, hasLinkOrButtonParent } from "../utils";
import { HashNavOverlay, renderTopbar } from "./overlay";
import { PopupMenu } from "./popup";
import { renderRichText } from "./posts";
import { ActorFeedStream, ActorLikesStream, FollowersStream, FollowingStream, LoggedInActorLikesStream } from "../streams";

@customElement("profile-overlay")
export class ProfileOverlay extends HashNavOverlay {
    @property()
    did?: string;

    @state()
    isLoading = true;

    @state()
    profile?: ProfileViewDetailed;

    @state()
    error?: string;

    @state()
    filter: ActorFeedType | "likes" = "posts_no_replies";

    async load() {
        const errorMessage = "Couldn't load profile of " + this.did;
        try {
            if (!State.isConnected()) throw Error();
            if (!this.did) throw Error();
            const profiles = await State.getProfiles([this.did]);
            if (profiles instanceof Error) throw profiles;
            this.profile = profiles[0];
        } catch (e) {
            this.error = errorMessage;
            error("Couldn't load profile", e);
        } finally {
            this.isLoading = false;
        }
    }

    getHash(): string {
        return "profile/" + this.did;
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        this.load();
    }

    renderHeader(): TemplateResult {
        return html`${renderTopbar("Profile", this.closeButton())}`;
    }

    renderContent(): TemplateResult {
        if (this.isLoading || this.error || !this.profile)
            return html`<div class="align-top p-4">${this.error ? this.error : html`<loading-spinner></loading-spinner>`}</div>`;

        const user = Store.getUser();
        const profile = this.profile;
        const rt = new RichText({ text: this.profile.description ?? "" });
        rt.detectFacetsWithoutResolution();

        const showFollowers = (ev: Event) => {
            ev.preventDefault();
            ev.stopImmediatePropagation();
            document.body.append(
                dom(
                    html`<profiles-stream-overlay
                        title="${i18n("Followers")}"
                        .hash=${`followers/${profile.did}`}
                        .stream=${new FollowersStream(profile.did)}
                    ></profiles-stream-overlay>`
                )[0]
            );
        };

        const showFollowing = (ev: Event) => {
            ev.preventDefault();
            ev.stopImmediatePropagation();
            document.body.append(
                dom(
                    html`<profiles-stream-overlay
                        title="${i18n("Following")}"
                        .hash=${`following/${profile.did}`}
                        .stream=${new FollowingStream(profile.did)}
                    ></profiles-stream-overlayy>`
                )[0]
            );
        };

        let feed: HTMLElement;

        if (this.profile.viewer?.blockedBy || this.profile.viewer?.blocking || this.profile.viewer?.blockingByList) {
            feed = dom(html`<div class="p-4 text-center">${i18n("Nothing to show")}</div>`)[0];
        } else {
            switch (this.filter) {
                case "posts_with_replies":
                case "posts_no_replies":
                case "posts_with_media":
                    feed = dom(html`<feed-stream-view .stream=${new ActorFeedStream(this.filter, this.profile.did)}></feed-stream-view>`)[0];
                    break;
                case "likes":
                    if (this.profile.did == Store.getUser()?.profile.did) {
                        feed = dom(html`<feed-stream-view .stream=${new LoggedInActorLikesStream()}></feed-stream-view>`)[0];
                    } else {
                        feed = dom(html`<posts-stream-view .stream=${new ActorLikesStream(this.profile.did)}></posts-stream-view>`)[0];
                    }
                    break;
                default:
                    feed = dom(html`<div class="p-4 text-center">${i18n("Nothing to show")}</div>`)[0];
            }
        }

        return html`<div>
            ${this.profile.banner
                ? html`<img
                      src="${profile.banner}"
                      class="${this.profile.viewer?.blockedBy || this.profile.viewer?.blocking || this.profile.viewer?.blockingByList
                          ? "blur"
                          : ""} w-full h-[150px] object-cover"
                  />`
                : html`<div class="bg-blue-500 h-[150px]"></div>`}
            <div class="flex px-4 mt-[-48px] items-end">
                ${profile.avatar
                    ? html`<img
                          class="${this.profile.viewer?.blockedBy || this.profile.viewer?.blocking || this.profile.viewer?.blockingByList
                              ? "blur"
                              : ""} w-24 h-24 rounded-full"
                          src="${profile.avatar}"
                      />`
                    : html`<i class="icon w-24 h-24">${defaultAvatar}</i>`}
                <div class="ml-auto flex items-center gap-2">
                    ${profile.did != user?.profile.did
                        ? html`<profile-action-button
                              .profile=${this.profile}
                              @change=${(ev: CustomEvent) => this.profileChanged(ev.detail)}
                          ></profile-action-button>`
                        : nothing}
                </div>
            </div>
            <div class="text-2xl px-4">${this.profile.displayName ?? this.profile.handle}</div>
            <div class="flex items-center gap-2 mt-2 px-4">
                ${profile.viewer?.followedBy ? html`<span class="p-1 text-xs rounded bg-muted text-muted-fg">${i18n("Follows you")}</span>` : nothing}
                <span class="text-muted-fg text-sm">${profile.handle}</span>
            </div>
            <div class="mt-2 text-sm flex flex-col gap-2 px-4">
                ${!(this.profile.viewer?.blockedBy || this.profile.viewer?.blocking || this.profile.viewer?.blockingByList)
                    ? html`
                            <div class="flex gap-2">
                            <a class="text-black dark:text-white" href="" target="_blank" @click=${showFollowers}
                                ><span class="font-bold">${getNumber(profile.followersCount)}</span> ${i18n("followers")}</a
                            >
                            <a class="text-black dark:text-white" href="" target="_blank" @click=${showFollowing}><span class="font-bold">${getNumber(
                          profile.followsCount
                      )}</span> ${i18n("following")}</a>
                            <span><span class="font-bold">${getNumber(profile.postsCount)}</span> ${i18n("posts")}</span>
                            </div>
                        </div>
                        <div class="mt-1 whitespace-pre-wrap">${renderRichText({
                            text: rt.text,
                            facets: rt.facets,
                            createdAt: "",
                        })}</div>`
                    : nothing}
                ${this.profile.viewer?.blockedBy ? html`<span>${i18n("You are blocked by the user.")}</span>` : nothing}
                ${this.profile.viewer?.blocking || this.profile.viewer?.blockingByList
                    ? html`<span>${i18n("You are blocking the user.")}</span>`
                    : nothing}
            </div>
            <div class="overflow-x-auto flex flex-nowrap border-b border-divider">
                <button
                    class="whitespace-nowrap ${this.filter == "posts_no_replies" ? "border-b-2 border-primary font-bold" : "text-muted-fg"} px-2 h-10"
                    @click=${() => (this.filter = "posts_no_replies")}
                >
                    ${i18n("Posts")}
                </button>
                <button
                    class="whitespace-nowrap ${this.filter == "posts_with_replies"
                        ? "border-b-2 border-primary font-bold"
                        : "text-muted-fg"} px-2 h-10"
                    @click=${() => (this.filter = "posts_with_replies")}
                >
                    ${i18n("Posts & Replies")}
                </button>
                <button
                    class="whitespace-nowrap ${this.filter == "posts_with_media" ? "border-b-2 border-primary font-bold" : "text-muted-fg"} px-2 h-10"
                    @click=${() => (this.filter = "posts_with_media")}
                >
                    ${i18n("Media")}
                </button>
                <button
                    class="whitespace-nowrap ${this.filter == "likes" ? "border-b-2 border-primary font-bold" : "text-muted-fg"} px-2 h-10"
                    @click=${() => (this.filter = "likes")}
                >
                    ${i18n("Likes")}
                </button>
            </div>
            <div class="min-h-screen">${feed}</div>
        </div>`;
    }

    profileChanged(profile: ProfileViewDetailed) {
        this.profile = profile;
    }
}

@customElement("profile-options")
export class ProfileOptionsElement extends PopupMenu {
    @property()
    profile?: ProfileView;

    protected renderButton(): TemplateResult {
        return html`<i slot="buttonText" class="icon w-5 h-5 fill-muted-fg">${moreIcon}</i>`;
    }
    protected renderContent(): TemplateResult {
        const createButton = (label: TemplateResult, click: () => void) => {
            return html`<button
                class="border-b border-divider py-2 px-2 hover:bg-primary hover:text-primary-fg"
                @click=${() => {
                    this.close();
                    click();
                }}
            >
                ${label}
            </button>`;
        };

        return html` ${createButton(html`<span>${i18n("Add to List")}</span>`, () => {})}
        ${createButton(html`<span>${i18n("Mute")}</span>`, () => {})} ${createButton(html`<span>${i18n("Block")}</span>`, () => {})}
        ${createButton(html`<span>${i18n("Report")}</span>`, () => {})}`;
    }
}

@customElement("profile-view")
export class ProfileViewElement extends LitElement {
    @property()
    profile?: ProfileView;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    render() {
        if (!this.profile) {
            return html`<div class="align-top"><loading-spinner></loading-spinner></div>`;
        }

        const user = Store.getUser();
        const rt = new RichText({ text: this.profile.description ?? "" });
        rt.detectFacetsWithoutResolution();

        return html`<div
            class="cursor-pointer"
            @click=${(ev: Event) => {
                if (!this.profile) return;
                if (hasLinkOrButtonParent(ev.target as HTMLElement)) return;
                ev.stopPropagation();
                document.body.append(dom(html`<profile-overlay .did=${this.profile.did}></profile-overlay>`)[0]);
            }}
        >
            <div class="flex flex-col">
                <div class="flex items-center">
                    <div class="flex flex-col">
                        ${renderProfile(this.profile)}
                        ${this.profile.viewer?.followedBy
                            ? html`<div class="mt-1">
                                  <span class="p-1 text-xs rounded bg-muted text-muted-fg">${i18n("Follows you")}</span>
                              </div>`
                            : nothing}
                    </div>

                    ${this.profile.did != user?.profile.did
                        ? html`<profile-action-button class="self-start ml-auto" .profile=${this.profile}></profile-action-button>`
                        : nothing}
                </div>
                <div class="mt-1 whitespace-pre-wrap">${renderRichText({ text: rt.text, facets: rt.facets, createdAt: "" })}</div>
            </div>
        </div>`;
    }
}

export function renderProfileAvatar(profile: ProfileView, smallAvatar = false) {
    return html`${profile.avatar
        ? html`<img loading="lazy" class="${smallAvatar ? "w-4 h-4" : "w-8 h-8"} rounded-full" src="${profile.avatar}" />`
        : defaultAvatar}`;
}

export function renderProfileNameAndHandle(profile: ProfileView, smallAvatar = false) {
    return html`<div class="flex flex-col">
        <span class="${smallAvatar ? "text-sm" : ""} font-bold line-clamp-1 text-black dark:text-white hover:underline"
            >${profile.displayName ?? profile.handle}</span
        >
        ${profile.displayName && !smallAvatar ? html`<span class="text-xs text-muted-fg">${profile.handle}</span>` : nothing}
    </div>`;
}

export function renderProfile(profile: ProfileView, smallAvatar = false) {
    const avatarClicked = (ev: Event) => {
        ev.preventDefault();
        ev.stopPropagation();
        document.body.append(dom(html`<profile-overlay .did=${profile.did}></profile-overlay>`)[0]);
    };

    return html`<a class="flex items-center gap-2" href="${getProfileUrl(profile.handle ?? profile.did)}" target="_blank" @click=${avatarClicked}>
        ${renderProfileAvatar(profile, smallAvatar)} ${renderProfileNameAndHandle(profile, smallAvatar)}
    </a>`;
}

export function getProfileUrl(account: ProfileView | string) {
    return `https://bsky.app/profile/${typeof account == "string" ? account : account.did}`;
}

@customElement("profile-action-button")
export class ProfileActionButton extends LitElement {
    @property()
    profile?: ProfileView;

    @state()
    isUpdating = false;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    render() {
        if (!this.profile) return html`${nothing}`;
        if (this.profile?.did == Store.getUser()?.profile.did) return html`${nothing}`;

        if (this.isUpdating) {
            return html`<button class="flex items-center justify-center min-w-[80px] w-[80px] bg-muted text-muted-fg rounded-full h-8"><i class="icon w-6 h-6 fill-muted-fg animate-spin">${spinnerIcon}</i></div>`;
        }

        const viewer = this.profile.viewer;
        let action = i18n("Follow");
        if (viewer?.following) action = i18n("Unfollow");
        if (viewer?.blocking) action = i18n("Unblock");
        return html`<button @click=${() => this.handleClick(action)} class="btn-toggle ${action == i18n("Follow") ? "active" : "inactive"}">
            ${action}
        </button>`;
    }

    async handleClick(action: string) {
        const user = Store.getUser();
        if (!user) return;
        if (!this.profile) return;
        if (!State.bskyClient) return;

        this.isUpdating = true;
        if (action == i18n("Unblock")) {
            const rkey = this.profile!.viewer!.blocking!.split("/").pop()!;
            await State.bskyClient.app.bsky.graph.block.delete({ repo: user.profile.did, rkey }, {});
            // Need to refetch in this case, as following info in viewer isn't set when blocked.
            for (let i = 0; i < 2; i++) {
                const response = await State.bskyClient.getProfile({ actor: this.profile.did });
                if (response.success) {
                    this.profile = response.data;
                }
            }
        }
        if (action == i18n("Unfollow")) {
            const rkey = this.profile!.viewer!.following!.split("/").pop();
            const result = await State.bskyClient.app.bsky.graph.follow.delete({ repo: user.profile.did, rkey }, {});
            this.profile.viewer!.following = undefined;
        }
        if (action == i18n("Follow")) {
            const result = await State.bskyClient.app.bsky.graph.follow.create(
                { repo: user.profile.did },
                { subject: this.profile.did, createdAt: new Date().toISOString() }
            );
            this.profile.viewer!.following = result.uri;
        }

        this.profile = { ...this.profile };
        this.isUpdating = false;
        this.requestUpdate();

        this.dispatchEvent(
            new CustomEvent("change", {
                detail: this.profile,
            })
        );
    }
}
