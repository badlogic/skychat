import { LitElement, TemplateResult, html, render, svg } from "lit";
import { i18n } from "./i18n";
import { spinnerIcon } from "./icons";
import { customElement } from "lit/decorators.js";

export const defaultAvatar = svg`<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="none" data-testid="userAvatarFallback"><circle cx="12" cy="12" r="12" fill="#0070ff"></circle><circle cx="12" cy="9.5" r="3.5" fill="#fff"></circle><path stroke-linecap="round" stroke-linejoin="round" fill="#fff" d="M 12.058 22.784 C 9.422 22.784 7.007 21.836 5.137 20.262 C 5.667 17.988 8.534 16.25 11.99 16.25 C 15.494 16.25 18.391 18.036 18.864 20.357 C 17.01 21.874 14.64 22.784 12.058 22.784 Z"></path></svg>`;
export const defaultFeed = svg`<svg width="36" height="36" viewBox="0 0 32 32" fill="none" stroke="none" data-testid="userAvatarFallback"><rect width="32" height="32" rx="4" fill="#0070FF"></rect><path d="M13.5 7.25C13.5 6.55859 14.0586 6 14.75 6C20.9648 6 26 11.0352 26 17.25C26 17.9414 25.4414 18.5 24.75 18.5C24.0586 18.5 23.5 17.9414 23.5 17.25C23.5 12.418 19.582 8.5 14.75 8.5C14.0586 8.5 13.5 7.94141 13.5 7.25ZM8.36719 14.6172L12.4336 18.6836L13.543 17.5742C13.5156 17.4727 13.5 17.3633 13.5 17.25C13.5 16.5586 14.0586 16 14.75 16C15.4414 16 16 16.5586 16 17.25C16 17.9414 15.4414 18.5 14.75 18.5C14.6367 18.5 14.5312 18.4844 14.4258 18.457L13.3164 19.5664L17.3828 23.6328C17.9492 24.1992 17.8438 25.1484 17.0977 25.4414C16.1758 25.8008 15.1758 26 14.125 26C9.63672 26 6 22.3633 6 17.875C6 16.8242 6.19922 15.8242 6.5625 14.9023C6.85547 14.1602 7.80469 14.0508 8.37109 14.6172H8.36719ZM14.75 9.75C18.8906 9.75 22.25 13.1094 22.25 17.25C22.25 17.9414 21.6914 18.5 21 18.5C20.3086 18.5 19.75 17.9414 19.75 17.25C19.75 14.4883 17.5117 12.25 14.75 12.25C14.0586 12.25 13.5 11.6914 13.5 11C13.5 10.3086 14.0586 9.75 14.75 9.75Z" fill="white"></path></svg>`;
export const youtubePlaYButton = svg`<svg height="100%" version="1.1" viewBox="0 0 68 48" width="100%"><path class="ytp-large-play-button-bg" d="M66.52,7.74c-0.78-2.93-2.49-5.41-5.42-6.19C55.79,.13,34,0,34,0S12.21,.13,6.9,1.55 C3.97,2.33,2.27,4.81,1.48,7.74C0.06,13.05,0,24,0,24s0.06,10.95,1.48,16.26c0.78,2.93,2.49,5.41,5.42,6.19 C12.21,47.87,34,48,34,48s21.79-0.13,27.1-1.55c2.93-0.78,4.64-3.26,5.42-6.19C67.94,34.95,68,24,68,24S67.94,13.05,66.52,7.74z" fill="#f00"></path><path d="M 45,24 27,14 27,34" fill="#fff"></path></svg>`;

export function getNumber(num: number | undefined): string {
    if (num == undefined) return "0";
    if (num < 1000) return num.toString();
    if (num < 1000000) return (num / 1000).toFixed(1) + "K";
    return (num / 1000000).toFixed(1) + "M";
}

export function getDateString(inputDateTime: Date, forceYear = false): string {
    const hours = inputDateTime.getHours();
    const minutes = inputDateTime.getMinutes();
    const seconds = inputDateTime.getSeconds();

    const paddedHours = String(hours).padStart(2, "0");
    const paddedMinutes = String(minutes).padStart(2, "0");
    const paddedSeconds = String(seconds).padStart(2, "0");

    const year = inputDateTime.getFullYear();
    const month = new String(inputDateTime.getMonth() + 1).padStart(2, "0");
    const day = new String(inputDateTime.getDate()).padStart(2, "0");

    const currDate = new Date();
    const printYear =
        currDate.getFullYear() != inputDateTime.getFullYear() ||
        currDate.getMonth() != inputDateTime.getMonth() ||
        currDate.getDay() != inputDateTime.getDay() ||
        forceYear;

    return paddedHours + ":" + paddedMinutes + ":" + paddedSeconds + (printYear ? ` ${year}-${month}-${day}` : "");
}

export function dom(template: TemplateResult, container?: HTMLElement | DocumentFragment): HTMLElement[] {
    if (container) {
        render(template, container);
        return [];
    }

    const div = document.createElement(`div`);
    render(template, div);
    const children: Element[] = [];
    for (let i = 0; i < div.children.length; i++) {
        children.push(div.children[i]);
    }
    return children as HTMLElement[];
}

export function getTimeDifference(utcTimestamp: number): string {
    const now = Date.now();
    const timeDifference = now - utcTimestamp;

    const seconds = Math.floor(timeDifference / 1000);
    if (seconds < 60) {
        return seconds + "s";
    }

    const minutes = Math.floor(timeDifference / (1000 * 60));
    if (minutes < 60) {
        return minutes + "m";
    }

    const hours = Math.floor(timeDifference / (1000 * 60 * 60));
    if (hours < 24) {
        return hours + "h";
    }

    const days = Math.floor(timeDifference / (1000 * 60 * 60 * 24));
    if (days < 30) {
        return days + "d";
    }

    const months = Math.floor(timeDifference / (1000 * 60 * 60 * 24 * 30));
    if (months < 12) {
        return months + "mo";
    }

    const years = Math.floor(timeDifference / (1000 * 60 * 60 * 24 * 365));
    return years + "y";
}

export type ImageInfo = {
    alt: string;
    dataUri: string;
    data: Uint8Array;
    mimeType: string;
};

function uint8ArrayToBase64(uint8Array: Uint8Array): string {
    let binary = "";
    uint8Array.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary);
}

export async function downloadImage(url: string): Promise<ImageInfo | Error> {
    try {
        const response = await fetch(url);
        if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            const data = new Uint8Array(arrayBuffer);
            let mimeType = "image/png";
            if (response.headers.get("Content-Type")?.startsWith("image")) mimeType = response.headers.get("Content-Type")!;
            const dataUri = `data:${mimeType};base64,${uint8ArrayToBase64(data)}`;
            return { alt: "", dataUri, mimeType, data };
        } else {
            return new Error(i18n("Failed to download image"));
        }
    } catch (error) {
        return new Error(i18n("Failed to download image"));
    }
}

export async function downloadImageAsFile(imageUrl: string, fileName: string): Promise<void> {
    try {
        const response = await fetchApi("resolve-blob?url=" + encodeURIComponent(imageUrl));
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const imageBlob = await response.blob();
        const url = URL.createObjectURL(imageBlob);

        const a = document.createElement("a");
        a.href = url;
        a.download = fileName || "downloaded-image";
        document.body.appendChild(a);
        a.click();

        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Error downloading image:", error);
    }
}

export async function readFile(file: File) {
    return new Promise<{ dataUri: string; mimeType: string }>((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            if (event.target && event.target.result) resolve({ dataUri: event.target.result as string, mimeType: file.type });
        };
        reader.readAsDataURL(file);
    });
}

export async function loadImageFile(file: File): Promise<ImageInfo> {
    const { dataUri, mimeType } = await readFile(file);
    const base64Data = dataUri.split(",")[1];
    const uint8Array = new Uint8Array(
        atob(base64Data)
            .split("")
            .map((char) => char.charCodeAt(0))
    );
    return { alt: "", dataUri, data: uint8Array, mimeType };
}

export async function loadImageFiles(imageFiles: FileList): Promise<ImageInfo[]> {
    const convertedDataArray: ImageInfo[] = [];
    for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        if (!file) continue;
        convertedDataArray.push(await loadImageFile(file));
    }
    return convertedDataArray;
}

export async function downscaleImage(imageData: ImageInfo, targetSizeInBytes = 960000): Promise<ImageInfo | Error> {
    const quality = imageData.mimeType === "image/jpeg" ? 0.7 : 1;
    const mimeType = imageData.mimeType === "image/jpeg" ? "image/jpeg" : "image/png";
    const maxIterations = 10;

    let finalData: Uint8Array = imageData.data;
    let finalDataUri: string = imageData.dataUri;

    if (targetSizeInBytes > imageData.data.length) return imageData;

    const img = new Image();
    img.src = imageData.dataUri;
    await new Promise((imgLoadResolve) => {
        img.onload = imgLoadResolve;
    });

    let lower = 0;
    let upper = 1;

    for (let i = 0; i < maxIterations; i++) {
        const middle = (lower + upper) / 2;
        let newWidth = img.width * middle;
        let newHeight = img.height * middle;

        const canvas = document.createElement("canvas");
        canvas.width = newWidth;
        canvas.height = newHeight;

        const ctx = canvas.getContext("2d");

        if (!ctx) {
            return new Error("Canvas context is not supported.");
        }

        ctx.drawImage(img, 0, 0, newWidth, newHeight);

        let scaledDataUri = canvas.toDataURL(mimeType, 1);

        let scaledData = new Uint8Array(
            atob(scaledDataUri.split(",")[1])
                .split("")
                .map((char) => char.charCodeAt(0))
        );

        if (scaledData.length > targetSizeInBytes) {
            upper = middle;
        } else {
            lower = middle;
            finalData = scaledData;
            finalDataUri = scaledDataUri;
        }
    }

    return { alt: imageData.alt, dataUri: finalDataUri, data: finalData, mimeType };
}

export function onVisibleOnce(target: Element, callback: () => void) {
    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    callback();
                    observer.unobserve(entry.target);
                }
            });
        },
        {
            root: null,
            rootMargin: "200px",
            threshold: 0.01,
        }
    );
    observer.observe(target);
}

export function onVisibilityChange(target: Element, onVisible: () => void, onInvisible: () => void): void {
    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    onVisible();
                } else {
                    onInvisible();
                }
            });
        },
        {
            root: null,
            rootMargin: "200px",
            threshold: 0.01,
        }
    );
    observer.observe(target);
}

export function hasHashtag(text: string, hashtag: string) {
    const tokens = text.split(/[ \t\n\r.,;!?'"]+/);
    for (const token of tokens) {
        if (token.toLowerCase() === hashtag.toLowerCase()) {
            return true;
        }
    }
    return false;
}

export function hasLinkOrButtonParent(el: Element | HTMLElement | null) {
    if (!el) return false;
    el = el as HTMLElement;
    while (el) {
        if (el.tagName == "A" || el.tagName == "BUTTON") return true;
        el = el.parentElement as HTMLElement;
    }
    return false;
}

export type AtUri = { repo: string; type: string; rkey: string };

export function splitAtUri(uri: string): AtUri {
    const tokens = uri.replace("at://", "").split("/");
    return { repo: tokens[0], type: tokens[1], rkey: tokens[2] };
}

export function combineAtUri(repo: string, rkey: string, type: string = "app.bsky.feed.post") {
    return "at://" + repo + "/" + type + "/" + rkey;
}

export function formatFileSize(size: number): string {
    if (size < 1024) {
        return size + " bytes";
    } else if (size < 1024 * 1024) {
        return (size / 1024).toFixed(2) + " KB";
    } else if (size < 1024 * 1024 * 1024) {
        return (size / 1024 / 1024).toFixed(2) + " MB";
    } else {
        return (size / 1024 / 1024 / 1024).toFixed(2) + " GB";
    }
}

function apiBaseUrl() {
    return location.href.includes("localhost") || location.href.includes("192.168.1") ? `http://${location.hostname}:3333/api/` : "/api/";
}

export function fetchApi(endpoint: String) {
    return fetch(apiBaseUrl() + endpoint);
}

export function supportsNotifications() {
    return "PushManager" in window && "Notification" in window && "indexedDB" in window && "serviceWorker" in navigator;
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isMobileBrowser(): boolean {
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;

    // Regular expressions for mobile User-Agent strings
    const mobileRegex =
        /android|avantgo|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od|ad)|iris|kindle|lge |maemo|midp|mini|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows (ce|phone)|xda|xiino/i;

    return mobileRegex.test(userAgent);
}

// We'll copy the properties below into the mirror div.
// Note that some browsers, such as Firefox, do not concatenate properties
// into their shorthand (e.g. padding-top, padding-bottom etc. -> padding),
// so we have to list every single property explicitly.
var properties = [
    "direction", // RTL support
    "boxSizing",
    "width", // on Chrome and IE, exclude the scrollbar, so the mirror div wraps exactly as the textarea does
    "height",
    "overflowX",
    "overflowY", // copy the scrollbar for IE

    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "borderStyle",

    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",

    // https://developer.mozilla.org/en-US/docs/Web/CSS/font
    "fontStyle",
    "fontVariant",
    "fontWeight",
    "fontStretch",
    "fontSize",
    "fontSizeAdjust",
    "lineHeight",
    "fontFamily",

    "textAlign",
    "textTransform",
    "textIndent",
    "textDecoration", // might not make a difference, but better be safe

    "letterSpacing",
    "wordSpacing",

    "tabSize",
    "MozTabSize",
];

export interface Caret {
    top: number;
    left: number;
    height: number;
}

interface Options {
    debug?: boolean | undefined;
}

export function getCaretPosition(textarea: HTMLTextAreaElement) {
    // Create a dummy div that will mimic the textarea
    let dummyDiv = document.createElement("div");
    document.body.appendChild(dummyDiv);

    // Apply the same styling to the dummy div as the textarea
    dummyDiv.style.font = window.getComputedStyle(textarea).font;
    dummyDiv.style.whiteSpace = "pre-wrap";
    dummyDiv.style.wordWrap = "break-word";
    dummyDiv.style.visibility = "hidden"; // Hide the div
    dummyDiv.style.position = "absolute"; // Avoid affecting layout

    // Replace newline characters with <br> and spaces with non-breaking spaces
    let content = textarea.value.substring(0, textarea.selectionStart).replace(/\n/g, "<br>").replace(/ /g, "&nbsp;");

    // Set the content of the dummy div
    dummyDiv.innerHTML = content;

    // Calculate the position
    let caretPos = {
        x: dummyDiv.offsetWidth,
        y: dummyDiv.offsetHeight,
    };

    // Clean up by removing the dummy div
    document.body.removeChild(dummyDiv);

    return caretPos;
}

export function assertNever(x: never) {
    throw new Error("Unexpected object: " + x);
}

export function error(message: string, exception?: any) {
    if (exception instanceof Error && exception.message.length == 0) exception = undefined;
    console.error(getDateString(new Date()) + " - " + message, exception);
    return new Error(message);
}

export function collectLitElements(element: HTMLElement): LitElement[] {
    const litElements: LitElement[] = [];

    function traverse(node: HTMLElement) {
        if (node instanceof LitElement) {
            litElements.push(node);
        }
        const children = node.children;
        for (let i = 0; i < children.length; i++) {
            traverse(children[i] as HTMLElement);
        }
    }
    traverse(element);
    return litElements;
}

export async function waitForLitElementsToRender(element: HTMLElement) {
    const promises: Promise<boolean>[] = [];
    const elements = collectLitElements(element);
    for (const el of elements) {
        promises.push(el.updateComplete);
    }
    await Promise.all(promises);
}

export function getScrollParent(parent: HTMLElement | null) {
    while (parent) {
        if (parent.classList.contains("overflow-auto")) return parent;
        parent = parent.parentElement;
    }
    return null;
}

export function waitForScrollHeightUnchanged(element: HTMLElement, cb: () => void, steadyInterval = 50) {
    let lastChangeTime = performance.now();
    let lastHeight = 0;
    const check = () => {
        const height = element.scrollHeight;
        if (height != lastHeight) {
            lastChangeTime = performance.now();
            lastHeight = height;
            requestAnimationFrame(check);
            return;
        }

        if (performance.now() - lastChangeTime > steadyInterval) {
            cb();
        } else {
            requestAnimationFrame(check);
        }
    };
    check();
}

export function waitForNavigation(): Promise<void> {
    return new Promise((resolve) => {
        window.addEventListener("popstate", function onPopState() {
            window.removeEventListener("popstate", onPopState);
            resolve();
        });
    });
}

export type AsyncTask = () => Promise<void>;

export class AsyncQueue {
    private tasks: AsyncTask[];
    private finalTask: AsyncTask;
    private isProcessing: boolean;

    constructor(finalTask: AsyncTask) {
        this.tasks = [];
        this.finalTask = finalTask;
        this.isProcessing = false;
    }

    enqueue(task: AsyncTask): void {
        this.tasks.push(task);
        if (!this.isProcessing) {
            this.processQueue();
        }
    }

    private async processQueue(): Promise<void> {
        this.isProcessing = true;
        while (this.tasks.length > 0) {
            const task = this.tasks.shift();
            if (task) {
                await task();
            }
        }
        this.isProcessing = false;
        await this.finalTask();
    }
}

export function enableYoutubeJSApi(originalString: string) {
    const srcIndex = originalString.indexOf('src="');

    if (srcIndex !== -1) {
        const closingQuoteIndex = originalString.indexOf('"', srcIndex + 5);

        if (closingQuoteIndex !== -1) {
            const srcValue = originalString.substring(srcIndex + 5, closingQuoteIndex);
            const updatedSrcValue = `${srcValue}&enablejsapi=1`;
            const updatedString = originalString.replace(srcValue, updatedSrcValue);
            return updatedString.replace("web-share", "");
        }
    }
    return originalString;
}

export function fixScrollTop(scrollableElement: HTMLElement, container: Element) {
    let previousLastChild = container.lastElementChild;
    let previousScrollHeight = container.scrollHeight;
    const observer = new ResizeObserver(function () {
        let isHeightIncreased = container.scrollHeight != previousScrollHeight;
        let isAppend = container.lastElementChild !== previousLastChild;
        if (isHeightIncreased && !isAppend) {
            let newScrollYPosition = container.scrollTop + container.scrollHeight - previousScrollHeight;
            previousScrollHeight = container.scrollHeight;
            container.scrollTop = newScrollYPosition;
        }
    });
    observer.observe(container);
}
