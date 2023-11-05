/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["*.{html,ts,css}"],
    darkMode: "class",
    theme: {
        extend: {
            colors: {
                primary: "#cc7d24",
                gray: "#555555",
                black: "#111111",
                red: "#cc0000",
            },
            screens: {
                pwa: { raw: "(display-mode: standalone)" },
            },
        },
    },
    plugins: [],
};
