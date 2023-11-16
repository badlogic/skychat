import { RichText } from "@atproto/api";
import { ProfileView, ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { LitElement, PropertyValueMap, TemplateResult, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { bskyClient } from "../bsky";
import { cacheProfile, profileCache } from "../cache";
import { Messages, i18n } from "../i18n";
import { moreIcon, spinnerIcon } from "../icons";
import { Store } from "../store";
import { contentLoader, defaultAvatar, dom, getNumber, hasLinkOrButtonParent } from "../utils";
import { ActorTimelineFilter, actorTimelineLoader } from "./feeds";
import { ItemListLoaderResult, ItemsList, ItemsListLoader } from "./list";
import { HashNavOverlay, renderTopbar } from "./overlay";
import { PopupMenu } from "./popup";
import { renderPostText } from "./posts";

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
    filter: ActorTimelineFilter = "posts_no_replies";

    async load() {
        const errorMessage = "Couldn't load profile of " + this.did;
        try {
            if (!bskyClient || !this.did) {
                this.error = errorMessage;
                return;
            }
            delete profileCache[this.did];
            await cacheProfile(bskyClient, this.did);
            this.profile = profileCache[this.did];
            if (!this.profile) {
                this.error = errorMessage;
                return;
            }
        } catch (e) {
            this.error = errorMessage;
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
        if (this.isLoading || this.error || !this.profile) return html`<div class="align-top p-4">${this.error ? this.error : contentLoader}</div>`;

        const user = Store.getUser();
        const profile = this.profile;
        const rt = new RichText({ text: this.profile.description ?? "" });
        rt.detectFacetsWithoutResolution();

        const showFollowers = (ev: Event) => {
            ev.preventDefault();
            ev.stopImmediatePropagation();
            document.body.append(
                dom(
                    html`<profile-list-overlay
                        title="${i18n("Followers")}"
                        .hash=${`followers/${profile.did}`}
                        .loader=${followersLoader(profile.did)}
                    ></profile-list-overlay>`
                )[0]
            );
        };

        const showFollowing = (ev: Event) => {
            ev.preventDefault();
            ev.stopImmediatePropagation();
            document.body.append(
                dom(
                    html`<profile-list-overlay
                        title="${i18n("Following")}"
                        .hash=${`following/${profile.did}`}
                        .loader=${followingLoader(profile.did)}
                    ></profile-list-overlay>`
                )[0]
            );
        };

        return html`<div>
            ${this.profile.banner
                ? html`<img
                      src="${profile.banner}"
                      class="${this.profile.viewer?.blockedBy || this.profile.viewer?.blocking || this.profile.viewer?.blockingByList
                          ? "blur"
                          : ""} h-[150px] object-cover"
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
                ${profile.viewer?.followedBy ? html`<span class="p-1 text-xs rounded bg-gray/50 text-white">${i18n("Follows you")}</span>` : nothing}
                <span class="text-gray dark:text-lightgray text-sm">${profile.handle}</span>
            </div>
            <div class="mt-2 text-sm flex flex-col gap-2 px-4">
                ${!(this.profile.viewer?.blockedBy || this.profile.viewer?.blocking || this.profile.viewer?.blockingByList)
                    ? html`
                            <div class="flex gap-2">
                            <a href="" target="_blank" @click=${showFollowers}
                                ><span class="font-bold">${getNumber(profile.followersCount)}</span> ${i18n("followers")}</a
                            >
                            <a href="" target="_blank" @click=${showFollowing}><span class="font-bold">${getNumber(
                          profile.followsCount
                      )}</span> ${i18n("following")}</a>
                            <span><span class="font-bold">${getNumber(profile.postsCount)}</span> ${i18n("posts")}</span>
                            </div>
                        </div>
                        <div class="mt-1 leading-tight whitespace-pre-wrap">${renderPostText({
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
            <div class="overflow-x-auto flex flex-nowrap border-b border-gray/50">
                <button
                    class="whitespace-nowrap ${this.filter == "posts_no_replies"
                        ? "border-b-2 border-primary font-bold"
                        : "text-gray dark:text-lightgray"} px-2 h-10"
                    @click=${() => (this.filter = "posts_no_replies")}
                >
                    ${i18n("Posts")}
                </button>
                <button
                    class="whitespace-nowrap ${this.filter == "posts_with_replies"
                        ? "border-b-2 border-primary font-bold"
                        : "text-gray dark:text-lightgray"} px-2 h-10"
                    @click=${() => (this.filter = "posts_with_replies")}
                >
                    ${i18n("Posts & Replies")}
                </button>
                <button
                    class="whitespace-nowrap ${this.filter == "posts_with_media"
                        ? "border-b-2 border-primary font-bold"
                        : "text-gray dark:text-lightgray"} px-2 h-10"
                    @click=${() => (this.filter = "posts_with_media")}
                >
                    ${i18n("Media")}
                </button>
                <button
                    class="whitespace-nowrap ${this.filter == "likes"
                        ? "border-b-2 border-primary font-bold"
                        : "text-gray dark:text-lightgray"} px-2 h-10"
                    @click=${() => (this.filter = "likes")}
                >
                    ${i18n("Likes")}
                </button>
            </div>
            ${!(this.profile.viewer?.blockedBy || this.profile.viewer?.blocking || this.profile.viewer?.blockingByList)
                ? html`<div class="min-h-[100dvh]">
                      <skychat-feed .feedLoader=${actorTimelineLoader(this.profile.did, this.filter)}></skychat-feed>
                  </div>`
                : html`<div class="p-4 text-center">${i18n("Nothing to show")}</div>`}
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
        return html`<i slot="buttonText" class="icon w-5 h-5 fill-gray">${moreIcon}</i>`;
    }
    protected renderContent(): TemplateResult {
        const createButton = (label: TemplateResult, click: () => void) => {
            return html`<button
                class="border-b border-gray/50 py-2 px-2 hover:bg-primary"
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
            return html`<div class="align-top">${contentLoader}</div>`;
        }

        const user = Store.getUser();
        const rt = new RichText({ text: this.profile.description ?? "" });
        rt.detectFacetsWithoutResolution();

        return html`<div
            class="cursor-pointer"
            @click=${(ev: Event) => {
                if (!bskyClient) return;
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
                            ? html`<div class="mt-1"><span class="p-1 text-xs rounded bg-gray/50 text-white">${i18n("Follows you")}</span></div>`
                            : nothing}
                    </div>

                    ${this.profile.did != user?.profile.did
                        ? html`<profile-action-button class="self-start ml-auto" .profile=${this.profile}></profile-action-button>`
                        : nothing}
                </div>
                <div class="mt-1 leading-tight whitespace-pre-wrap">${renderPostText({ text: rt.text, facets: rt.facets, createdAt: "" })}</div>
            </div>
        </div>`;
    }
}

@customElement("profile-list")
export class ProfileList extends ItemsList<string, ProfileView> {
    @property()
    loader: (cursor?: string) => Promise<ItemListLoaderResult<string, ProfileView>> = async () => {
        return { items: [] };
    };

    async loadItems(cursor?: string): Promise<ItemListLoaderResult<string, ProfileView>> {
        return this.loader(cursor);
    }

    getItemKey(item: ProfileView): string {
        return item.did;
    }

    renderItem(item: ProfileView): TemplateResult {
        return html`<profile-view .profile=${item}></profile-view>`;
    }
}

@customElement("profile-list-overlay")
export class ProfileListOverlay extends HashNavOverlay {
    @property()
    title: string = "";

    @property()
    hash: string = "";

    @property()
    loader: (cursor?: string) => Promise<ItemListLoaderResult<string, ProfileView>> = async () => {
        return { items: [] };
    };

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    getHash(): string {
        return this.hash;
    }

    renderHeader(): TemplateResult {
        return html` ${renderTopbar(this.title as keyof Messages, this.closeButton())}`;
    }

    renderContent(): TemplateResult {
        return html`<profile-list .loader=${this.loader}></profile-list>`;
    }
}

export function likesLoader(postUri?: string): ItemsListLoader<string, ProfileView> {
    return async (cursor?: string, limit?: number) => {
        if (!bskyClient) return new Error(i18n("Not connected"));
        if (!postUri) return new Error(i18n("No post given"));
        const result = await bskyClient.getLikes({ cursor, limit, uri: postUri });
        if (!result.success) {
            return new Error(i18n("Couldn't load likes"));
        }
        return { cursor: result.data.cursor, items: result.data.likes.map((like) => like.actor) };
    };
}

export function repostLoader(postUri?: string): ItemsListLoader<string, ProfileView> {
    return async (cursor?: string, limit?: number) => {
        if (!bskyClient) return new Error(i18n("Not connected"));
        if (!postUri) return new Error(i18n("No post given"));
        const result = await bskyClient.getRepostedBy({ cursor, limit, uri: postUri });
        if (!result.success) {
            return new Error(i18n("Could not load reposts"));
        }
        return { cursor: result.data.cursor, items: result.data.repostedBy };
    };
}

export function followersLoader(did: string): ItemsListLoader<string, ProfileView> {
    return async (cursor?: string, limit?: number) => {
        if (!bskyClient) return new Error(i18n("Not connected"));
        if (!did) return new Error(i18n("No account given"));
        const result = await bskyClient.getFollowers({ cursor, limit, actor: did });
        if (!result.success) {
            return new Error(i18n("Could not load followers"));
        }
        return { cursor: result.data.cursor, items: result.data.followers };
    };
}

export function followingLoader(did: string): ItemsListLoader<string, ProfileView> {
    return async (cursor?: string, limit?: number) => {
        if (!bskyClient) return new Error(i18n("Not connected"));
        if (!did) return new Error(i18n("No account given"));
        const result = await bskyClient.getFollows({ cursor, limit, actor: did });
        if (!result.success) {
            return new Error(i18n("Could not load followings"));
        }
        return { cursor: result.data.cursor, items: result.data.follows };
    };
}

export function renderProfile(profile: ProfileView, smallAvatar = false) {
    return html`<a
        class="flex items-center gap-2"
        href="${getProfileUrl(profile.handle ?? profile.did)}"
        target="_blank"
        @click=${(ev: Event) => {
            if (!bskyClient) return;
            ev.preventDefault();
            ev.stopPropagation();
            document.body.append(dom(html`<profile-overlay .did=${profile.did}></profile-overlay>`)[0]);
        }}
    >
        ${profile.avatar
            ? html`<img loading="lazy" class="${smallAvatar ? "w-4 h-4" : "w-8 h-8"} rounded-full" src="${profile.avatar}" />`
            : defaultAvatar}
        <div class="flex flex-col">
            <span class="${smallAvatar ? "text-sm" : ""} font-bold line-clamp-1 hover:underline">${profile.displayName ?? profile.handle}</span>
            ${profile.displayName && !smallAvatar ? html`<span class="text-xs text-gray -mt-1">${profile.handle}</span>` : nothing}
        </div>
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
            return html`<button class="flex items-center justify-center min-w-[80px] w-[80px] bg-gray/50 text-white rounded-full h-8"><i class="icon w-6 h-6 fill-gray animate-spin">${spinnerIcon}</i></div>`;
        }

        const viewer = this.profile.viewer;
        let action = i18n("Follow");
        if (viewer?.following) action = i18n("Unfollow");
        if (viewer?.blocking) action = i18n("Unblock");
        return html`<button
            @click=${() => this.handleClick(action)}
            class="${action != i18n("Follow") ? "bg-gray/50" : "bg-primary"} text-white text-sm rounded-full px-4 h-8"
        >
            ${action}
        </button>`;
    }

    async handleClick(action: string) {
        const user = Store.getUser();
        if (!user) return;
        if (!this.profile) return;
        if (!bskyClient) return;

        this.isUpdating = true;
        if (action == i18n("Unblock")) {
            const rkey = this.profile!.viewer!.blocking!.split("/").pop()!;
            await bskyClient.app.bsky.graph.block.delete({ repo: user.profile.did, rkey }, {});
            // Need to refetch in this case, as following info in viewer isn't set when blocked.
            delete profileCache[this.profile.did];
            for (let i = 0; i < 2; i++) {
                const response = await bskyClient.getProfile({ actor: this.profile.did });
                if (response.success) {
                    this.profile = response.data;
                }
            }
        }
        if (action == i18n("Unfollow")) {
            const rkey = this.profile!.viewer!.following!.split("/").pop();
            const result = await bskyClient.app.bsky.graph.follow.delete({ repo: user.profile.did, rkey }, {});
            this.profile.viewer!.following = undefined;
        }
        if (action == i18n("Follow")) {
            const result = await bskyClient.app.bsky.graph.follow.create(
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
