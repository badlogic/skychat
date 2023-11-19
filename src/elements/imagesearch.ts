import { PropertyValueMap, TemplateResult, html } from "lit";
import { Overlay, renderTopbar } from "./overlay";
import { i18n } from "../i18n";
import { customElement, property, query } from "lit/decorators.js";
import { dom, error, onVisibleOnce } from "../utils";
import { spinnerIcon } from "../icons";

const GIPHY_API_KEY = "Tv9Va9sXl2rooRvBG6xaUhVz4zHfzTH4";

interface SearchedImage {
    width: number;
    height: number;
    mp4?: string;
    url?: string;
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
        }
        try {
            const response = await fetch(
                `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(GIPHY_API_KEY)}&q=${query}&offset=${this.offset}`
            );
            const data = (await response.json()) as GiphyResponse;
            this.offset += data.data.length;
            return data.data.map((img) => img.images.fixed_width);
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
    error = "";

    lastGridIndex = 0;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        this.searchElement?.focus();
    }

    renderHeader(): TemplateResult {
        return renderTopbar(
            dom(
                html`<div class="flex items-center"><span>${i18n("GIF Search")}</span><img src="/img/giphy.png" class="w-[150px] h-auto" /></div>`
            )[0],
            this.closeButton()
        );
    }
    renderContent(): TemplateResult {
        return html`<div class="flex flex-col px-4 mt-2">
            <input
                @input=${() => this.handleSearch()}
                id="search"
                class="border border-gray rounded-full outline-none bg-transparent drop:bg-white dark:text-white disabled:text-gray dark:disabled:text-gray px-4 py-2"
                placeholder="${i18n("Search for GIFS...")}"
            />
            <div id="imageGrid" class="grid grid-cols-2 sm:grid-cols-4 gap-1">
                <div class="grid gap-2"></div>
                <div class="grid gap-2"></div>
                <div class="grid gap-2"></div>
                <div class="grid gap-2"></div>
            </div>
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
            for (const col of Array.from(this.imageGridElement!.children)) {
                col.innerHTML = "";
            }
            this.loadMoreImages(this.searchElement!.value);
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
        const gridCols = imageGrid.children;

        for (const image of images) {
            const col = gridCols[this.lastGridIndex++ % 4];
            if (image.mp4) {
                col.append(
                    dom(
                        html`<div class="flex justify-center items-center">
                            <video
                                src="${image.mp4}"
                                class="w-full h-auto object-cover"
                                style="aspect-ratio: ${image.width}/${image.height};"
                                autoplay
                                loop
                            ></video>
                        </div>`
                    )[0]
                );
            } else if (image.url) {
                col.append(
                    dom(
                        html`<div class="flex justify-center items-center">
                            <img src="${image.url}" class="w-full h-auto" style="aspect-ratio: ${image.width}/${image.height};" />
                        </div>`
                    )[0]
                );
            }
        }
    }
}
