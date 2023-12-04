import { RichText } from "@atproto/api";
import { ProfileView, ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { LitElement, PropertyValueMap, TemplateResult, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { Messages, i18n } from "../i18n";
import { blockIcon, linkIcon, moreIcon, muteIcon, shieldIcon, spinnerIcon } from "../icons";
import { ActorFeedType, EventAction, State } from "../state";
import { Store } from "../store";
import { copyTextToClipboard, defaultAvatar, dom, error, getNumber, getScrollParent, hasLinkOrButtonParent, itemPlaceholder } from "../utils";
import { HashNavOverlay, renderTopbar } from "./overlay";
import { PopupMenu } from "./popup";
import { renderRichText } from "./posts";
import {
    ActorFeedStream,
    ActorGeneratorsStream,
    ActorLikesStream,
    ActorListsStream,
    FollowersStream,
    FollowingStream,
    LoggedInActorLikesStream,
} from "../streams";
import { GeneratorViewElementAction } from "./feeds";
import { GeneratorView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { ListViewElementAction } from "./lists";
import { ListView } from "@atproto/api/dist/client/types/app/bsky/graph/defs";
import { toast } from "./toast";
import { IconToggle } from "./icontoggle";
import { getSkychatProfileUrl } from "../bsky.js";

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
    filter: ActorFeedType | "likes" | "generators" | "lists" = "posts_no_replies";

    hasGenerators = false;
    hasLists = false;

    async load() {
        const errorMessage = "Couldn't load profile of " + this.did;
        try {
            if (!State.isConnected()) throw Error();
            if (!this.did) throw Error();
            const profiles = await State.getProfiles([this.did]);
            if (profiles instanceof Error) throw profiles;
            this.profile = profiles[0];
            const promises = [State.getActorGenerators(this.profile.did, undefined, 1), State.getActorLists(this.profile.did, undefined, 1)];
            const results = await Promise.all(promises);
            this.hasGenerators = !(results[0] instanceof Error) && results[0].items.length > 0;
            this.hasLists = !(results[1] instanceof Error) && results[1].items.length > 0;
            State.subscribe(
                "profile",
                (action: EventAction, profile: ProfileView) => {
                    if (action == "updated_profile_moderation") {
                        this.profile = profile;
                    }
                },
                this.profile.did
            );
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
                case "generators":
                    const generatorAction = (action: GeneratorViewElementAction, generator: GeneratorView) => {
                        if (action == "clicked") {
                            document.body.append(dom(html`<feed-overlay .feedUri=${generator.uri}></feed-overlay>`)[0]);
                        }
                    };
                    feed = dom(
                        html`<generators-stream-view
                            .minimal=${false}
                            .stream=${new ActorGeneratorsStream(this.profile.did)}
                            .action=${(action: GeneratorViewElementAction, generator: GeneratorView) => generatorAction(action, generator)}
                        ></generators-stream-view>`
                    )[0];
                    break;
                case "lists":
                    const listAction = (action: ListViewElementAction, list: ListView) => {
                        if (action == "clicked") {
                            document.body.append(dom(html`<list-overlay .listUri=${list.uri}></list-overlay>`)[0]);
                        }
                    };
                    feed = dom(
                        html`<lists-stream-view
                            .minimal=${false}
                            .stream=${new ActorListsStream(this.profile.did)}
                            .action=${(action: ListViewElementAction, list: ListView) => listAction(action, list)}
                        ></lists-stream-view>`
                    )[0];
                    break;
                default:
                    feed = dom(html`<div class="p-4 text-center">${i18n("Nothing to show")}</div>`)[0];
            }
        }

        const openGallery = (ev: Event, imageUrl: string) => {
            ev.preventDefault();
            ev.stopPropagation();
            ev.stopImmediatePropagation();
            const galleryImages = [{ url: imageUrl }];
            document.body.append(dom(html`<image-gallery-overlay .images=${galleryImages} .imageIndex=${0}></image-gallery-overlay>`)[0]);
        };

        return html`<div>
            ${this.profile.banner
                ? html`<img
                      @click=${(ev: MouseEvent) => openGallery(ev, this.profile!.banner!)}
                      src="${profile.banner}"
                      class="${this.profile.viewer?.blockedBy || this.profile.viewer?.blocking || this.profile.viewer?.blockingByList
                          ? "blur"
                          : ""} w-full h-[150px] object-cover -mt-2"
                  />`
                : html`<div class="bg-blue-500 h-[150px] -mt-2"></div>`}
            <div class="flex px-4 mt-[-48px] items-end">
                ${profile.avatar
                    ? html`<img
                          @click=${(ev: MouseEvent) => openGallery(ev, this.profile!.avatar!)}
                          class="${this.profile.viewer?.blockedBy || this.profile.viewer?.blocking || this.profile.viewer?.blockingByList
                              ? "blur"
                              : ""} w-24 h-24 rounded-full fancy-shadow"
                          src="${profile.avatar}"
                      />`
                    : html`<i class="icon !w-24 !h-24">${defaultAvatar}</i>`}
                <div class="ml-auto flex items-center gap-2">
                    ${profile.did != user?.profile.did
                        ? html`<profile-action-button
                              .profile=${this.profile}
                              @change=${(ev: CustomEvent) => this.profileChanged(ev.detail)}
                          ></profile-action-button>`
                        : nothing}
                </div>
            </div>
            <div class="text-2xl px-4 flex items-center">
                ${this.profile.displayName ?? this.profile.handle}
                <button
                    class="flex items-center justify-center w-10 h-4"
                    @click=${() => {
                        copyTextToClipboard(getSkychatProfileUrl(this.profile!));
                        toast(i18n("Copied link to clipboard"));
                    }}
                >
                    <i class="icon !w-5 !h-5 fill-muted-fg">${linkIcon}</i>
                </button>
            </div>
            <div class="flex items-center gap-2 mt-2 px-4">
                ${profile.viewer?.followedBy ? html`<span class="p-1 text-xs rounded bg-muted text-muted-fg">${i18n("Follows you")}</span>` : nothing}
                <span class="text-muted-fg text-sm">${profile.handle}</span>
            </div>
            ${Store.getDevPrefs()?.enabled
                ? html`<div class="flex items-center gap-2 px-4">
                      <button
                          class="text-primary font-bold"
                          @click=${() => {
                              copyTextToClipboard(this.profile!.did);
                              toast("Copied did to clipboard");
                          }}
                      >
                          did</button
                      ><button
                          class="text-primary font-bold"
                          @click=${() => {
                              copyTextToClipboard(JSON.stringify(this.profile, null, 2));
                              toast("Copied JSON to clipboard");
                              console.log(this.profile);
                          }}
                      >
                          JSON
                      </button>
                  </div>`
                : nothing}
            <div class="mt-2 text-sm flex flex-col gap-2 px-4">
                ${!(this.profile.viewer?.blockedBy || this.profile.viewer?.blocking || this.profile.viewer?.blockingByList)
                    ? html`
                            <div class="flex gap-2">
                            <a class="text-black dark:text-white" href="" target="_blank" @click=${showFollowers}
                                ><span class="font-semibold">${getNumber(profile.followersCount)}</span> ${i18n("followers")}</a
                            >
                            <a class="text-black dark:text-white" href="" target="_blank" @click=${showFollowing}><span class="font-semibold">${getNumber(
                          profile.followsCount
                      )}</span> ${i18n("following")}</a>
                            <span><span class="font-semibold">${getNumber(profile.postsCount)}</span> ${i18n("posts")}</span>
                            </div>
                        </div>
                        <div class="mt-1">${renderRichText({
                            text: rt.text,
                            facets: rt.facets,
                            createdAt: "",
                        })}</div>`
                    : nothing}
                ${this.profile.viewer?.muted || this.profile.viewer?.mutedByList
                    ? itemPlaceholder(i18n("You are muting the user."), html`${shieldIcon}`)
                    : nothing}
                ${this.profile.viewer?.m ? itemPlaceholder(i18n("You are blocked by the user."), html`${shieldIcon}`) : nothing}
                ${this.profile.viewer?.blockedBy ? itemPlaceholder(i18n("You are blocked by the user."), html`${shieldIcon}`) : nothing}
                ${this.profile.viewer?.blocking || this.profile.viewer?.blockingByList
                    ? itemPlaceholder(i18n("You are blocking the user."), html`${shieldIcon}`)
                    : nothing}
            </div>
            <div class="overflow-x-auto flex flex-nowrap border-b border-divider">
                <button
                    class="whitespace-nowrap ${this.filter == "posts_no_replies"
                        ? "border-b-2 border-primary font-semibold"
                        : "text-muted-fg"} px-2 h-10"
                    @click=${() => (this.filter = "posts_no_replies")}
                >
                    ${i18n("Posts")}
                </button>
                <button
                    class="whitespace-nowrap ${this.filter == "posts_with_replies"
                        ? "border-b-2 border-primary font-semibold"
                        : "text-muted-fg"} px-2 h-10"
                    @click=${() => (this.filter = "posts_with_replies")}
                >
                    ${i18n("Posts & Replies")}
                </button>
                <button
                    class="whitespace-nowrap ${this.filter == "posts_with_media"
                        ? "border-b-2 border-primary font-semibold"
                        : "text-muted-fg"} px-2 h-10"
                    @click=${() => (this.filter = "posts_with_media")}
                >
                    ${i18n("Media")}
                </button>
                <button
                    class="whitespace-nowrap ${this.filter == "likes" ? "border-b-2 border-primary font-semibold" : "text-muted-fg"} px-2 h-10"
                    @click=${() => (this.filter = "likes")}
                >
                    ${i18n("Likes")}
                </button>
                ${this.hasGenerators
                    ? html`<button
                          class="whitespace-nowrap ${this.filter == "generators"
                              ? "border-b-2 border-primary font-semibold"
                              : "text-muted-fg"} px-2 h-10"
                          @click=${() => (this.filter = "generators")}
                      >
                          ${i18n("Feeds")}
                      </button>`
                    : nothing}
                ${this.hasLists
                    ? html` <button
                          class="whitespace-nowrap ${this.filter == "lists" ? "border-b-2 border-primary font-semibold" : "text-muted-fg"} px-2 h-10"
                          @click=${() => (this.filter = "lists")}
                      >
                          ${i18n("Lists")}
                      </button>`
                    : nothing}
            </div>
            <div class="min-h-screen">${feed}</div>
            ${Store.getUser()
                ? html`<open-post-editor-button .text=${"@" + this.profile.handle + " "}></open-post-editor-button>
                      <notifications-button id="notifications"></notifications-button>`
                : nothing}
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

    @property()
    actionButtons?: (profileElement: ProfileViewElement, profile: ProfileView) => TemplateResult;

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

                    ${this.actionButtons
                        ? this.actionButtons(this, this.profile)
                        : this.profile.did != user?.profile.did
                        ? html`<profile-action-button class="self-start ml-auto" .profile=${this.profile}></profile-action-button>`
                        : nothing}
                </div>
                <div class="text-sm mt-1">${renderRichText({ text: rt.text, facets: rt.facets, createdAt: "" })}</div>

                ${Store.getDevPrefs()?.enabled
                    ? html`<div class="flex items-center gap-2">
                          <button
                              class="text-primary font-bold"
                              @click=${() => {
                                  copyTextToClipboard(this.profile!.did);
                                  toast("Copied did to clipboard");
                              }}
                          >
                              did</button
                          ><button
                              class="text-primary font-bold"
                              @click=${() => {
                                  copyTextToClipboard(JSON.stringify(this.profile, null, 2));
                                  toast("Copied JSON to clipboard");
                                  console.log(this.profile);
                              }}
                          >
                              JSON
                          </button>
                      </div>`
                    : nothing}
            </div>
        </div>`;
    }
}

export function renderProfileAvatar(profile: ProfileView, smallAvatar = false) {
    return html`${profile.avatar
        ? html`<img loading="lazy" class="${smallAvatar ? "w-4 h-4" : "w-8 h-8 fancy-shadow"} rounded-full" src="${profile.avatar}" />`
        : defaultAvatar}`;
}

export function renderProfileNameAndHandle(profile: ProfileView, smallAvatar = false) {
    return html`<div class="flex flex-col">
        <span class="${smallAvatar ? "text-sm" : ""} font-semibold line-clamp-1 text-black dark:text-white hover:underline"
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
        if (!Store.getUser()) return html`${nothing}`;

        if (this.isUpdating) {
            return html`<button class="flex items-center justify-center min-w-[80px] w-[80px] bg-muted text-muted-fg rounded-full h-8 fancy-shadow"><i class="icon !w-6 !h-6 fill-muted-fg animate-spin">${spinnerIcon}</i></div>`;
        }

        const viewer = this.profile.viewer;
        let action = !viewer?.following ? i18n("Follow") : i18n("Unfollow");
        return html`<div class="flex items-center gap-2">
            ${!viewer?.blocking && !viewer?.blockingByList
                ? html`<icon-toggle
                      @change=${(ev: CustomEvent) => this.handleMute(ev.target as IconToggle, ev.detail.value)}
                      .icon=${html`<i class="icon !w-5 !h-5">${muteIcon}</i>`}
                      .value=${viewer?.muted || viewer?.mutedByList}
                      class="w-6 h-6"
                  ></icon-toggle>`
                : nothing}
            <icon-toggle
                @change=${(ev: CustomEvent) => this.handleBlock(ev.target as IconToggle, ev.detail.value)}
                .icon=${html`<i class="icon !w-5 !h-5">${blockIcon}</i>`}
                .value=${viewer?.blocking || viewer?.blockingByList}
                class="w-6 h-6"
            ></icon-toggle>
            ${!viewer?.blocking && !viewer?.blockingByList
                ? html`<button @click=${() => this.handleFollow(action)} class="btn-toggle ${action == i18n("Follow") ? "active" : "inactive"}">
                      ${action}
                  </button>`
                : nothing}
        </div>`;
    }

    async handleMute(toggle: IconToggle, muted: boolean) {
        if (!State.bskyClient) return;
        if (!this.profile) return;

        try {
            const result = muted ? await State.muteActor(this.profile.did) : await State.unmuteActor(this.profile.did);
            if (result instanceof Error) throw result;
            this.profile = State.getObject("profile", this.profile.did);
        } catch (e) {
            error("Couldn't (un-)mute actor");
            toast(muted ? i18n("Couldn't mute user") : i18n("Couldn't unmute user"));
            toggle.value = !toggle.value;
        }
    }

    async handleBlock(toggle: IconToggle, block: boolean) {
        if (!State.bskyClient) return;
        if (!this.profile) return;
        const user = Store.getUser();
        if (!user) return;

        try {
            this.isUpdating = true;
            const result = block ? await State.blockActor(this.profile.did) : await State.unblockActor(this.profile.did);
            if (result instanceof Error) throw result;
            this.profile = State.getObject("profile", this.profile.did);
        } catch (e) {
            error("Couldn't (un-)block actor");
            toast(block ? i18n("Couldn't block user") : i18n("Couldn't unblock user"));
            toggle.value = !toggle.value;
        } finally {
            this.isUpdating = false;
        }
    }

    async handleFollow(action: string) {
        // FIXME this is fucked! Needs to notify state
        const user = Store.getUser();
        if (!user) return;
        if (!this.profile) return;
        if (!State.bskyClient) return;

        this.isUpdating = true;
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

        State.notify("profile", "updated_profile_moderation", this.profile);
    }
}
