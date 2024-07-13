import type { PlasmoContentScript } from "plasmo"

export const config: PlasmoContentScript = {
    matches: ["https://huggingface.co/*"],
    world: "MAIN"
}

// Intercept fetch requests
const originalFetch = window.fetch
window.fetch = async function (...args) {
    const request = args[0]
    if (request instanceof Request) {
        // Add CORS headers for your extension's requests
        if (request.url.includes("your-extension-specific-url")) {
            request.headers.set("Cross-Origin-Resource-Policy", "same-origin")
        }
    }
    return originalFetch.apply(this, args)
}

// Intercept XHR requests
const originalXHROpen = XMLHttpRequest.prototype.open
XMLHttpRequest.prototype.open = function (...args) {
    const url = args[1]
    if (
        typeof url === "string" &&
        url.includes("your-extension-specific-url")
    ) {
        this.setRequestHeader("Cross-Origin-Resource-Policy", "same-origin")
    }
    return originalXHROpen.apply(this, args)
}

console.log("CORS handler initialized")
