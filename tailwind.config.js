/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["src/**/*.{html,ts,css}", "html/**/*.{html,ts,css}"],
    darkMode: "class",
    theme: {
        extend: {
            colors: {
                background: "var(--background)",
                accent: "var(--accent)",
                "accent-dark": "var(--accent-dark)",
                primary: "var(--primary)",
                "primary-dark": "var(--primary-dark)",
                "primary-fg": "var(--primary-fg)",
                secondary: "var(--secondary)",
                "secondary-fg": "var(--secondary-fg)",
                hinted: "var(--hinted)",
                "hinted-fg": "var(--hinted-fg)",
                muted: "var(--muted)",
                "muted-fg": "var(--muted-fg)",
                input: "var(--input)",
                divider: "var(--divider)",
            },
            screens: {
                pwa: { raw: "(display-mode: standalone)" },
            },
            overflow: {
                "x-clip": "clip",
            },
        },
    },
    plugins: [require("tailwindcss-animated")],
};
