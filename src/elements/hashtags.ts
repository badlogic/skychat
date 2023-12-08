import { BskyPreferences } from "@atproto/api";
import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { LitElement, PropertyValueMap, TemplateResult, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { HashNavOverlay, StreamView, renderTopbar } from ".";
import { i18n } from "../i18n";
import { FEED_CHECK_INTERVAL } from "../state";
import { Store } from "../store";
import { PostSearchStream, TrendingHashtag, TrendingHashtagsStream } from "../streams";
import { dom, error } from "../utils";
import { ProfileViewElement } from "./profiles";
import { hashIcon, minusIcon, plusIcon, speechBubbleIcon } from "../icons.js";

@customElement("trending-hashtag")
export class TrendingHashtagElement extends LitElement {
    @property()
    hashtag?: TrendingHashtag;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    @property()
    actionButtons?: (hashtagElement: TrendingHashtagElement, hashtag: TrendingHashtag) => TemplateResult;

    render() {
        if (!this.hashtag) return html`<loading-spinner></loading-spinner>`;
        return html`<div
            class="flex items-center cursor-pointer"
            @click=${() => {
                document.body.append(dom(html`<hashtag-overlay .hash=${this.hashtag?.tag}></hashtag-overlay>`)[0]);
            }}
        >
            <span class="text-blue-500">#${this.hashtag.name}</span>
            <div class="ml-auto p-1 text-xs rounded bg-muted text-muted-fg flex items-center gap-1">
                <i class="icon !w-4 !h-4 fill-muted-fg">${speechBubbleIcon}</i><span>${this.hashtag.count}</span>
            </div>
            ${this.actionButtons ? this.actionButtons(this, this.hashtag!) : nothing}
        </div>`;
    }
}

@customElement("trending-hashtags-stream-view")
export class HashtagsStreamView extends StreamView<TrendingHashtag> {
    @property()
    actionButtons?: (hashtagElement: TrendingHashtagElement, hashtag: TrendingHashtag) => TemplateResult;

    constructor() {
        super();
    }

    renderItem(item: TrendingHashtag, polledItems: boolean): TemplateResult {
        return html`<trending-hashtag .hashtag=${item} .actionButtons=${this.actionButtons}></trending-hashtag>`;
    }
}

@customElement("hashtag-overlay")
export class HashOverlay extends HashNavOverlay {
    @property()
    hash?: string;

    @property()
    error?: string;

    getHash(): string {
        if (!this.hash) return "hash/unknown";
        return "hashtag/" + encodeURIComponent(this.hash);
    }

    renderHeader(): TemplateResult {
        if (!this.hash) return renderTopbar("Hashtag Feed", this.closeButton(false));
        const hashName = html`<div class="flex items-center gap-1 grow font-semibold">
            <i class="icon !w-6 !h-6">${hashIcon}</i> <span>${this.hash}</span>
        </div>`;
        return renderTopbar(dom(hashName)[0], html`<div class="-ml-2">${this.closeButton()}</div>`);
    }

    renderContent(): TemplateResult {
        if (this.error) return html`<div id="error" class="align-top p-4">${this.error}</div>`;
        if (!this.hash) return html`<div id="error" class="align-top p-4">${i18n("No hashtag given")}</div>`;

        return html`<posts-stream-view .stream=${new PostSearchStream(this.hash, false, true, FEED_CHECK_INTERVAL)}></posts-streams-view>`;
    }
}

@customElement("hashtag-picker")
export class HashtagPicker extends HashNavOverlay {
    @property()
    error?: string;

    unsubscribe = () => {};

    getHash(): string {
        return "hashtags";
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        this.handlePeriodChange(i18n("Hour"));
        /*this.unsubscribe = State.subscribe("preferences", (action, payload) => {
            if (action == "updated" && !this.isOnTop()) {
                this.load(payload);
            }
        });*/
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        this.unsubscribe();
    }

    async load(prefs?: BskyPreferences | Error) {
        try {
            if (prefs instanceof Error) {
                this.error = i18n("Couldn't load your hashtag feeds");
                throw prefs;
            }

            const user = Store.getUser();
        } catch (e) {
            error("Couldn't load preferences and lists", e);
            this.error = i18n("Couldn't load your lists");
        } finally {
        }
    }

    renderHeader(): TemplateResult {
        return renderTopbar("Hashtag Feeds", this.closeButton());
    }

    renderContent(): TemplateResult {
        if (this.error) return html`<div id="error" class="align-top p-4">${this.error}</div>`;

        return html`<div class="flex flex-col">
            <div class="flex items-center justify-center py-4">
                <button @click=${() => this.newHashtagFeed()} class="btn rounded-full flex gap-2 items-center">${i18n("New Hashtag Feed")}</button>
            </div>
            <div class="px-4 flex gap-2 items-center text-muted-fg text-muted-fg">
                <span>${i18n("Trending hashtags")}</span>
                <span class="ml-auto text-xs text-muted-fg">powered by</span>
                <a href="https://skyfeed.app" class="flex items-center"
                    ><img src="https://skyfeed.app/android-chrome-512x512.png" class="w-8 h-8" /> <span>SkyFeed</span></a
                >
            </div>
            <div class="self-center mt-4 mb-4">
                <button-group
                    .values=${[i18n("10 minutes"), i18n("Hour"), i18n("Day"), i18n("Week")]}
                    .selected=${i18n("Hour")}
                    @change=${(ev: CustomEvent) => this.handlePeriodChange(ev.detail.value)}
                ></button-group>
            </div>
            <div id="trendingResults"></div>
        </div>`;
    }

    addHashtag() {}

    removeHashtag() {}

    handlePeriodChange(period: string) {
        const actionButtons = (hashtagElement: TrendingHashtagElement, hashtag: TrendingHashtag) => {
            return html`
                <icon-toggle
                    @change=${(ev: CustomEvent) => (!ev.detail.value ? this.addHashtag() : this.removeHashtag())}
                    .icon=${html`<i class="icon !w-5 !h-5">${minusIcon}</i>`}
                    .iconTrue=${html`<i class="icon !w-5 !h-5">${plusIcon}</i>`}
                    .value=${true}
                    class="w-8 h-8"
                ></icon-toggle>
            `;
        };

        let minutes = 60;
        if (period == i18n("10 minutes")) minutes = 10;
        if (period == i18n("Hour")) minutes = 60;
        if (period == i18n("Day")) minutes = 60 * 24;
        if (period == i18n("Week")) minutes = 60 * 24 * 7;
        const trendingStream = html`<trending-hashtags-stream-view
            .stream=${new TrendingHashtagsStream(minutes)}
            .actionButtons=${actionButtons}
        ></trending-hashtags-stream-view>`;
        const trendingResult = this.querySelector("#trendingResults") as HTMLElement;
        trendingResult.innerHTML = "";
        trendingResult.append(dom(trendingStream)[0]);
    }

    newHashtagFeed() {}

    // async hashtagFeedAction(action: HashtagFeedElementAction, list: ListView) {}
}

/*@customElement("list-editor")
export class ListEditor extends HashNavOverlay {
    @property()
    listUri?: string;

    @property()
    list?: ListView;

    @property()
    saved = (list: ListView) => {};

    @property()
    purpose: "curation" | "moderation" = "curation";

    @property()
    isLoading = true;

    @query("#name")
    nameElement?: HTMLInputElement;

    @query("#description")
    descriptionElement?: QuillEditor;

    @state()
    error?: string;

    @state()
    editError?: string;

    @state()
    imageToUpload?: ImageInfo;

    @state()
    isLoadingMembers = true;
    members: ListItemView[] = [];
    addedMembers: ProfileView[] = [];

    @state()
    canSave = false;

    @state()
    isSaving = false;

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        this.load();
        setTimeout(() => {
            this.nameElement?.focus();
        }, 0);
    }

    async load() {
        try {
            if (!this.listUri) return;
            this.canSave = true;
            const list = this.list ? this.list : await State.getList(this.listUri);
            if (list instanceof Error) throw list;
            let cursor: string | undefined;
            this.list = list;
            this.listUri = list.uri;
            this.isLoading = false;
            this.requestUpdate();

            const members: ListItemView[] = [];
            while (true) {
                const response = await State.getListItems(this.listUri, cursor);
                if (response instanceof Error) throw response;
                if (response.items.length == 0) break;
                members.push(...response.items);
                cursor = response.cursor;
            }
            this.members = members;
            this.isLoadingMembers = false;
        } catch (e) {
            this.error = i18n("Could not load list");
        } finally {
            this.isLoading = false;
            this.isLoadingMembers = false;
        }
    }

    getHash(): string {
        if (!this.listUri) return "list/new";
        const atUri = splitAtUri(this.listUri);
        return "list/edit/" + atUri.repo + "/" + atUri.rkey;
    }

    renderHeader(): TemplateResult {
        const buttons = html`<div class="flex items-center ml-auto -mr-2 gap-4">
            ${this.isSaving
                ? html`<span>${i18n("Saving list")}</span><i class="-ml-2 icon !w-6 !h-6 animate-spin fill-primary">${spinnerIcon}</i>`
                : html`<button class="text-muted-fg" @click=${() => this.close()}>${i18n("Cancel")}</button>
                      <button class="btn" ?disabled=${!this.canSave} @click=${() => this.save()}>${i18n("Save")}</button>`}
        </div> `;
        return renderTopbar(
            this.listUri
                ? this.purpose == "curation"
                    ? "Edit List"
                    : "Edit Moderation List"
                : this.purpose == "curation"
                ? "New List"
                : "New Moderation List",
            buttons
        );
    }

    renderContent(): TemplateResult {
        if (this.error) return html`<div id="error" class="align-top p-4">${this.error}</div>`;
        if (this.isLoading) return html`<loading-spinner></loading-spinner>`;

        return html`<div class="flex flex-col w-full h-full overflow-auto gap-2 mx-auto mt-4">
            ${this.editError ? renderError(this.editError) : nothing}
            <div class="flex gap-2 items-center px-4 ">
                <div
                    class="cursor-pointer flex-grow-0 flex-shrink-0 w-[66px] h-[66px] rounded overflow-x-clip flex items-center justify-center border border-divider"
                    @click=${() => this.addImage()}
                >
                    ${this.imageToUpload
                        ? html`<img src="${this.imageToUpload.dataUri}" class="w-full h-full object-cover" />`
                        : this.list?.avatar
                        ? html`<img src="${this.list.avatar}" class="w-full h-full object-cover" />`
                        : html` <i class="icon !w-[32px] !h-[32px] dark:fill-[#fff]">${cameraIcon}</i> `}
                </div>
                <div class="flex flex-col gap-2 w-full">
                    <div class="text-muted-fg">${i18n("Name")}</div>
                    <input
                        id="name"
                        class="textinput text-black dark:text-white"
                        placeholder="${i18n("E.g. 'Cool people'")}"
                        value=${this.list?.name ?? ""}
                        @input=${() => (this.canSave = (this.nameElement?.value.length ?? 0) > 0)}
                    />
                </div>
            </div>

            <div class="px-4 text-muted-fg">${i18n("Description")}</div>

            <div class="mx-4 border border-divider rounded h-36 flex">
                <quill-text-editor id="description" .initialText=${this.list?.description ?? ""} class="w-full h-full"></quill-text-editor>
            </div>

            ${this.isLoadingMembers
                ? html`${this.isLoadingMembers ? html`<loading-spinner></loading-spinner>` : nothing}`
                : html`<div class="flex items-center px-4 pt-4 pb-4 border-b border-divider">
                    <span>${getNumber(this.members.length + this.addedMembers.length)} ${i18n("people")}</span>
                <button class="btn ml-auto" @click=${() => this.addPeople()}>${i18n("Add people")}<button>
            </div>
            <div id="addedMembers">
            </div>
            <list-items-stream-view
                .stream=${new ListItemsStream(memoryStreamProvider(this.members))}
                .newItems=${async (newItems: StreamPage<ProfileView> | Error) => {
                    if (newItems instanceof Error) {
                        this.error = i18n("Could not load newer items");
                    }
                }}
                .showEndOfList=${false}
                .actionButtons=${(profileElement: ProfileViewElement, profile: ProfileView) =>
                    html`<button class="ml-auto self-start" @click=${() =>
                        this.removeMember(profileElement, profile)}><i class="icon !w-6 !h-6 fill-muted-fg">${minusIcon}</button>`}
            ></list-items-stream-view>`}
        </div>`;
    }

    addImage() {
        const input = dom(html`<input type="file" id="file" accept=".jpg, .jpeg, .png" class="hidden" multiple />`)[0] as HTMLInputElement;
        document.body.append(input);
        input.addEventListener("change", async () => {
            if (!input.files || input.files.length == 0) return;
            const files = input.files;
            this.imageToUpload = (await loadImageFiles(files))[0];
            input.remove();
        });
        input.click();
    }

    async removeMember(profileElement: ProfileViewElement, actor: ProfileView) {
        const existingListItem = this.members.find((other) => other.subject.did == actor.did);
        if (existingListItem && this.listUri) {
            State.removeActorListMembers(this.listUri, [existingListItem.uri]);
        }
        this.members = this.members.filter((other) => other.subject.did != actor.did);
        this.addedMembers = this.addedMembers.filter((other) => other.did != actor.did);
        profileElement.parentElement?.parentElement?.remove();
        this.requestUpdate();
    }

    addPeople() {
        const add = async (actor: ProfileView) => {
            if (this.listUri) {
                const addedListItems = await State.addActorListMembers(this.listUri, [actor.did]);
                if (addedListItems instanceof Error) {
                    this.error = i18n("Couldn't add user to list");
                } else {
                    this.members.unshift({ subject: actor, uri: addedListItems[0] });
                }
            } else {
                this.addedMembers.push(actor);
            }
            const addedMembersElement = this.querySelector("#addedMembers");
            if (addedMembersElement) {
                addedMembersElement.append(
                    dom(
                        StreamView.renderWrapped(
                            html`<profile-view
                                .profile=${actor}
                                .actionButtons=${(profileElement: ProfileViewElement, profile: ProfileView) =>
                                    html`<button class="ml-auto self-start" @click=${() =>
                                        this.removeMember(profileElement, profile)}><i class="icon !w-6 !h-6 fill-muted-fg">${minusIcon}</button>`}
                            ></profile-view>`
                        )
                    )[0]
                );
                this.requestUpdate();
            }
        };
        document.body.append(
            dom(
                html`<actor-search-overlay
                    .selectedActor=${(actor: ProfileView) => add(actor)}
                    .filter=${(actor: ProfileView) => {
                        let found = false;
                        found ||= this.addedMembers.some((other) => other.did == actor.did);
                        found ||= this.members.some((other) => other.did == actor.did);
                        return !found;
                    }}
                ></actor-search-overlay>`
            )[0]
        );
    }

    async save() {
        try {
            this.isSaving = true;
            this.requestUpdate();
            if (!this.nameElement || !this.descriptionElement) {
                this.close();
                return;
            }
            if (this.nameElement.value.trim().length == 0) {
                this.editError = i18n("Name is required");
                return;
            }

            let image: BlobRef | undefined;
            if (this.imageToUpload) {
                const start = performance.now();
                const data = await downscaleImage(this.imageToUpload);
                if (data instanceof Error) throw data;
                console.log(
                    "Downscaling image took: " +
                        (performance.now() - start) / 1000 +
                        ", old: " +
                        this.imageToUpload.data.length +
                        ", new: " +
                        data.data.length
                );
                const response = await State.bskyClient!.com.atproto.repo.uploadBlob(data.data, {
                    headers: { "Content-Type": this.imageToUpload.mimeType },
                    encoding: "",
                });
                if (!response.success) throw Error();
                image = response.data.blob;
            }

            const rt = new RichText({ text: this.descriptionElement.getText() ?? "" });
            rt.detectFacetsWithoutResolution();
            const record: AppBskyGraphList.Record = {
                createdAt: new Date().toISOString(),
                name: this.nameElement.value.trim(),
                purpose: this.purpose == "curation" ? "app.bsky.graph.defs#curatelist" : "app.bsky.graph.defs#modlist",
                avatar: image,
                description: this.descriptionElement.getText(),
                descriptionFacets: rt.facets,
                labels: undefined,
            };

            if (!this.listUri) {
                const list = await State.createActorList(record);
                if (list instanceof Error) {
                    this.error = i18n("Couldn't save list");
                    return;
                }
                const members = await State.addActorListMembers(
                    list.uri,
                    this.addedMembers.map((profile) => profile.did)
                );
                if (members instanceof Error) throw members;
                this.saved(list);
            } else {
                const { repo, type, rkey } = splitAtUri(this.listUri);
                const listResponse = await State.bskyClient?.com.atproto.repo.getRecord({ collection: type, repo, rkey });
                if (listResponse?.success == false) throw new Error();
                if (!record.avatar) record.avatar = (listResponse?.data.value as any)?.avatar;
                const list = await State.updateActorList(this.listUri, record);
                if (list instanceof Error) {
                    this.error = i18n("Couldn't save list");
                    return;
                }
                this.saved(list);
            }

            this.close();
        } catch (e) {
            this.error = i18n("Couldn't save list");
            return;
        } finally {
            this.isSaving = false;
        }
    }
}*/
