import OpenAI from "openai";

const images = [
    "https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:7syfakzcriq44mwbdbc7jwvn/bafkreihavnlrkir2v37csnqwo53jpg2qyghaqju6jqbadecgwutdtmufxi@jpeg",
];

const openAiKey = process.env.SKYCHAT_OPENAI;

if (!openAiKey) {
    console.error("No OpenAI key given");
    process.exit(-1);
}

const openai = new OpenAI({
    apiKey: openAiKey,
});

async function main() {
    for (const image of images) {
        const response = await openai.chat.completions.create({
            model: "gpt-4-vision-preview",
            max_tokens: 4000,
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "What's in this image? Describe it in German." },
                        {
                            type: "image_url",
                            image_url: {
                                url: image,
                                detail: "low",
                            },
                        },
                    ],
                },
            ],
        });
        console.log(response);
        console.log(response.choices[0]);
    }
}
main();
