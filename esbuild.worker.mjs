#!/usr/bin/env node

import esbuild from "esbuild";

let watch = process.argv.length >= 3 && process.argv[2] == "--watch";

const config = {
    entryPoints: {
        "firebase-messaging-sw": "src/service-worker.ts",
    },
    bundle: true,
    sourcemap: true,
    outdir: "html/",
    loader: {
        ".ttf": "dataurl",
        ".woff": "dataurl",
        ".woff2": "dataurl",
        ".eot": "dataurl",
        ".html": "text",
        ".svg": "text",
        ".css": "text",
    },
    logLevel: "info",
    minify: !watch,
};

if (!watch) {
    console.log("Building worker");
    await esbuild.build(config);
} else {
    const buildContext = await esbuild.context(config);
    buildContext.watch();
}
