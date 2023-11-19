import * as zlib from "zlib";
import { promisify } from "util";
import { set } from "husky";

// promisify the zlib.gzip function for async/await usage
const gzip = promisify(zlib.gzip);

async function compress(jsonObj: object): Promise<number> {
    try {
        // Stringify JSON Object
        const jsonString = JSON.stringify(jsonObj);

        // Zip the stringified JSON
        const zippedData = await gzip(Buffer.from(jsonString, "utf-8"));

        // Base64 encode the zipped data
        const base64Encoded = zippedData.toString("base64");

        // Output the length of the base64 encoded data
        return base64Encoded.length;
    } catch (error) {
        console.error("Error processing JSON object:", error);
        throw error;
    }
}

function generateRandomString(): string {
    const prefix = "at://did:plc:";
    const middle = "/app.bsky.feed.post/";
    const partLength = 24; // Length of the '7syfakzcriq44mwbdbc7jwvn' part
    const suffixLength = 15; // Length of the '3kej2se3eoc2h' part
    let randomPart = "";
    let randomSuffix = "";

    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const charactersLength = characters.length;

    // Generate the random part (7syfakzcriq44mwbdbc7jwvn)
    for (let i = 0; i < partLength; i++) {
        randomPart += characters.charAt(Math.floor(Math.random() * charactersLength));
    }

    // Generate the random suffix (3kej2se3eoc2h)
    for (let i = 0; i < suffixLength; i++) {
        randomSuffix += characters.charAt(Math.floor(Math.random() * charactersLength));
    }

    return prefix + randomPart + middle + randomSuffix;
}

(async () => {
    const mutedThreads: string[] = [];
    for (let i = 0; i < 3000; i++) {
        mutedThreads.push(generateRandomString());
    }

    const settings = {
        theme: "dark",
        mutedThreads,
    };

    console.log("json: " + JSON.stringify(settings).length);
    console.log("zip: " + (await compress(settings)));
})();
