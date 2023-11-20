import { PropertyValueMap, TemplateResult, html } from "lit";
import { Overlay, renderTopbar } from "./overlay";
import { i18n } from "../i18n";
import { customElement, property, query } from "lit/decorators.js";
import { dom, error, onVisibilityChange, onVisibleOnce } from "../utils";
import { spinnerIcon } from "../icons";
import { Store } from "../store";

const GIPHY_API_KEY = "Tv9Va9sXl2rooRvBG6xaUhVz4zHfzTH4";

interface SearchedImage {
    width: number;
    height: number;
    mp4?: string;
    imageUrl?: string;
    url: string;
}

interface GiphyResponse {
    data: {
        url: string;
        images: {
            downsized_small: SearchedImage;
            fixed_width_small: SearchedImage;
            fixed_width: SearchedImage;
        };
    }[];
    meta: { status: number; msg: string; response_id: string };
    pagination: { total_count: number; count: number; offset: number };
}

interface ImageSearchProvider {
    next(query: string): Promise<SearchedImage[] | Error>;
}

class GiphyImageSearch implements ImageSearchProvider {
    offset = 0;
    query = "";

    async next(query: string) {
        if (this.query != query) {
            this.offset = 0;
            this.query = query;
            console.log("Changed query to " + query);
        }
        try {
            const response = await fetch(
                `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(GIPHY_API_KEY)}&q=${query}&offset=${this.offset}`
            );
            const data = (await response.json()) as GiphyResponse;
            this.offset += data.data.length;
            const images: SearchedImage[] = [];
            for (const img of data.data) {
                const image = img.images.fixed_width;
                images.push({ width: image.width, height: image.height, mp4: image.mp4, imageUrl: image.url, url: img.url });
            }
            return images;
        } catch (e) {
            return error("Couldn't fetch more images", e);
        }
    }
}

@customElement("image-search")
export class ImageSearch extends Overlay {
    @query("#search")
    searchElement?: HTMLInputElement;

    @query("#imageGrid")
    imageGridElement?: HTMLDivElement;

    @query("#spinnerino")
    spinnerElement?: HTMLElement;

    @property()
    provider: ImageSearchProvider = new GiphyImageSearch();

    @property()
    selected: (url: string) => void = () => {};

    @property()
    error = "";

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        this.searchElement?.focus();
    }

    renderHeader(): TemplateResult {
        return renderTopbar(
            dom(
                html`<div class="flex items-center">
                    <span>${i18n("GIF Search")}</span
                    ><img src="/img/${Store.getTheme() == "dark" ? "giphy.png" : "giphy-light.png"}" class="ml-2 w-[150px] h-auto" />
                </div>`
            )[0],
            this.closeButton()
        );
    }
    renderContent(): TemplateResult {
        return html`<div class="flex flex-col px-4 mt-2">
            <input @input=${() => this.handleSearch()} id="search" class="search" placeholder="${i18n("Search for GIFS...")}" />
            <div id="imageGrid" class="flex flex-col gap-2 mt-2"></div>
            <div id="spinnerino" class="hidden w-full h-12 flex items-center justify-center">
                <i class="absolute ml-2 icon w-6 h-6 animate-spin">${spinnerIcon}</i>
            </div>
            <div id="error" class="align-top p-4">${this.error}</div>
        </div>`;
    }

    timeoutId = 0;
    handleSearch() {
        clearTimeout(this.timeoutId);
        this.timeoutId = setTimeout(async () => {
            for (const image of Array.from(this.imageGridElement!.children)) {
                (image.querySelector("video") as HTMLVideoElement)?.pause();
            }
            this.imageGridElement!.innerHTML = "";
            this.spinnerElement?.classList.add("hidden");
            const spinner = dom(html`<loading-spinner></loading-spinner>`)[0];
            this.imageGridElement?.append(spinner);
            await this.loadMoreImages(this.searchElement!.value);
            spinner.remove();
        }, 200) as any as number;
    }

    async loadMoreImages(query: string) {
        if (!this.provider) return;
        try {
            const response = await this.provider.next(query);
            if (response instanceof Error) {
                this.error = i18n("Couldn't load images");
                return;
            }
            this.appendImages(response);
            if (response.length > 0) {
                const spinner = this.spinnerElement;
                if (!spinner) return;
                spinner.classList.remove("hidden");
                onVisibleOnce(spinner, () => {
                    spinner.classList.add("hidden");
                    if (query != this.searchElement?.value) return;
                    this.loadMoreImages(query);
                });
            }
        } catch (e) {
            error("Couldn't search for GIFs", e);
        }
    }

    appendImages(images: SearchedImage[]) {
        const imageGrid = this.imageGridElement;
        if (!imageGrid) return;

        for (const image of images) {
            if (image.mp4) {
                const videoDom = dom(
                    html`<div class="flex justify-center items-center">
                        <video
                            @click=${() => {
                                this.close();
                                this.selected(image.url);
                            }}
                            src="${image.mp4}"
                            class="w-full h-auto cursor-pointer rounded"
                            muted
                            loop
                            playsinline
                            disableRemotePlayback
                        ></video>
                    </div>`
                )[0];
                imageGrid.append(videoDom);
                onVisibilityChange(
                    videoDom,
                    () => {
                        const video = videoDom.querySelector("video") as HTMLVideoElement;
                        try {
                            video.play();
                        } catch (e) {
                            // NOOP
                        }
                    },
                    () => {
                        const video = videoDom.querySelector("video") as HTMLVideoElement;
                        try {
                            video.pause();
                        } catch (e) {
                            // NOOP
                        }
                    }
                );
            } else if (image.imageUrl) {
                imageGrid.append(
                    dom(
                        html`<div class="flex justify-center items-center">
                            <img
                                @click=${() => {
                                    this.close();
                                    this.selected(image.url);
                                }}
                                src="${image.imageUrl}"
                                class="w-full h-auto cursor-pointer rounded"
                            />
                        </div>`
                    )[0]
                );
            }
        }
    }
}
