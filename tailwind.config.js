/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["src/**/*.{html,ts,css}", "html/**/*.{html,ts,css}"],
    darkMode: "class",
    theme: {
        extend: {
            colors: {
                primary: "#cc7d24",
                gray: "#555555",
                lightgray: "#b9b9c1",
                black: "#111111",
                red: "#cc0000",
            },
            screens: {
                pwa: { raw: "(display-mode: standalone)" },
            },
        },
    },
    plugins: [require("tailwindcss-animated")],
};
