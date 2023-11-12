import { AppBskyActorDefs, AtpSessionData, AtpSessionEvent, BskyAgent } from "@atproto/api";
import { TemplateResult, html, render, svg } from "lit";
import { bskyClient } from "./bsky";
import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { i18n } from "./i18n";

export function getNumber(num: number | undefined): string {
    if (num == undefined) return "0";
    if (num < 1000) return num.toString();
    if (num < 1000000) return (num / 1000).toFixed(1) + "K";
    return (num / 1000000).toFixed(1) + "M";
}

export function getDateString(inputDateTime: Date): string {
    const hours = inputDateTime.getHours();
    const minutes = inputDateTime.getMinutes();
    const seconds = inputDateTime.getSeconds();

    const paddedMinutes = String(minutes).padStart(2, "0");
    const paddedSeconds = String(seconds).padStart(2, "0");

    const year = inputDateTime.getFullYear();
    const month = new String(inputDateTime.getMonth() + 1).padStart(2, "0");
    const day = new String(inputDateTime.getDate()).padStart(2, "0");

    const currDate = new Date();
    const printYear =
        currDate.getFullYear() != inputDateTime.getFullYear() ||
        currDate.getMonth() != inputDateTime.getMonth() ||
        currDate.getDay() != inputDateTime.getDay();

    return hours + ":" + paddedMinutes + ":" + paddedSeconds + (printYear ? ` ${year}-${month}-${day}` : "");
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

export const defaultAvatar = svg`<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="none" data-testid="userAvatarFallback"><circle cx="12" cy="12" r="12" fill="#0070ff"></circle><circle cx="12" cy="9.5" r="3.5" fill="#fff"></circle><path stroke-linecap="round" stroke-linejoin="round" fill="#fff" d="M 12.058 22.784 C 9.422 22.784 7.007 21.836 5.137 20.262 C 5.667 17.988 8.534 16.25 11.99 16.25 C 15.494 16.25 18.391 18.036 18.864 20.357 C 17.01 21.874 14.64 22.784 12.058 22.784 Z"></path></svg>`;

export const contentLoader = html`<div class="flex space-x-4 animate-pulse w-[80%] max-w-[300px] m-auto py-4">
    <div class="rounded-full bg-gray/50 dark:bg-gray h-10 w-10"></div>
    <div class="flex-1 space-y-6 py-1">
        <div class="h-2 bg-gray/50 dark:bg-gray rounded"></div>
        <div class="space-y-3">
            <div class="grid grid-cols-3 gap-4">
                <div class="h-2 bg-gray/50 dark:bg-gray rounded col-span-2"></div>
                <div class="h-2 bg-gray/50 dark:bg-gray rounded col-span-1"></div>
            </div>
            <div class="h-2 bg-gray/50 dark:bg-gray rounded"></div>
        </div>
    </div>
</div>`;

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

export function hasHashtag(text: string, hashtag: string) {
    const tokens = text.split(/[ \t\n\r.,;!?'"]+/);
    for (const token of tokens) {
        if (token.toLowerCase() === hashtag.toLowerCase()) {
            return true;
        }
    }
    return false;
}

export function renderAuthor(author: ProfileView, smallAvatar = false) {
    return html`<a
        class="flex items-center gap-2"
        href="${getProfileUrl(author.handle ?? author.did)}"
        target="_blank"
        @click=${(ev: Event) => {
            if (!bskyClient) return;
            ev.preventDefault();
            ev.stopPropagation();
            document.body.append(dom(html`<profile-overlay .did=${author.did}></profile-overlay>`)[0]);
        }}
    >
        ${author.avatar
            ? html`<img loading="lazy" class="${smallAvatar ? "w-[1em] h-[1em]" : "w-[2em] h-[2em]"} rounded-full" src="${author.avatar}" />`
            : defaultAvatar}
        <span class="${smallAvatar ? "text-sm" : ""} font-bold line-clamp-1 hover:underline">${author.displayName ?? author.handle}</span>
    </a>`;
}

export function getProfileUrl(account: ProfileView | string) {
    return `https://bsky.app/profile/${typeof account == "string" ? account : account.did}`;
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

export function waitForServiceWorkerActivation(registration: ServiceWorkerRegistration): Promise<ServiceWorker | undefined> {
    return new Promise<ServiceWorker | undefined>((resolve, reject) => {
        if (registration.active) {
            resolve(registration.active);
        } else {
            registration.addEventListener("activate", (event) => {
                if (event.target instanceof ServiceWorkerRegistration && event.target.active) {
                    resolve(event.target.active);
                } else {
                    reject(new Error("Service Worker activation failed"));
                }
            });
        }
    });
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

export function apiBaseUrl() {
    return location.href.includes("localhost") || location.href.includes("192.168.1") ? "http://localhost:3333/" : "/";
}
