import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
    matches: ["https://huggingface.co/*"]
}

const rules: chrome.declarativeNetRequest.Rule[] = [
    {
        id: 1,
        priority: 1,
        action: {
            type: "modifyHeaders",
            responseHeaders: [
                {
                    header: "Cross-Origin-Opener-Policy",
                    operation: "set",
                    value: "same-origin"
                },
                {
                    header: "Cross-Origin-Embedder-Policy",
                    operation: "set",
                    value: "require-corp"
                }
            ]
        },
        condition: {
            urlFilter: "|https://huggingface.co/*",
            resourceTypes: ["main_frame"]
        }
    },
    {
        id: 2,
        priority: 2,
        action: {
            type: "modifyHeaders",
            responseHeaders: [
                {
                    header: "Cross-Origin-Resource-Policy",
                    operation: "set",
                    value: "cross-origin"
                }
            ]
        },
        condition: {
            urlFilter: "|https://huggingface.co/*",
            resourceTypes: ["script"]
        }
    },
    {
        id: 3,
        priority: 3,
        action: {
            type: "modifyHeaders",
            responseHeaders: [
                { header: "Cross-Origin-Resource-Policy", operation: "remove" }
            ]
        },
        condition: {
            urlFilter: "*",
            excludedInitiatorDomains: ["huggingface.co"],
            resourceTypes: ["image", "media", "font", "stylesheet"]
        }
    }
]

chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: rules.map((rule) => rule.id),
    addRules: rules
})

console.log("DeclarativeNetRequest rules have been set up.")
