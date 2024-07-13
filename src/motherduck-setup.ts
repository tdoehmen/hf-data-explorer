export function setupMotherDuckInterceptor() {
    const originalXHROpen = XMLHttpRequest.prototype.open
    XMLHttpRequest.prototype.open = function (
        method: string,
        url: string | URL,
        ...args: any[]
    ) {
        if (url.toString().includes("duckdb-browser-eh.wasm")) {
            console.log("Intercepting MotherDuck WASM file load")
            url = chrome.runtime.getURL("assets/duckdb-browser-eh.wasm")
        }
        return originalXHROpen.call(this, method, url, ...args)
    }

    const originalCreateObjectURL = URL.createObjectURL
    URL.createObjectURL = function (object: any) {
        if (
            object instanceof Blob &&
            object.type === "application/javascript"
        ) {
            // Assume this is the worker script
            console.log("Intercepting worker Blob URL creation")
            return chrome.runtime.getURL("assets/motherduck-worker.js")
        }
        return originalCreateObjectURL(object)
    }

    const originalCreateElement = document.createElement.bind(document)
    document.createElement = function (
        tagName: string,
        options?: ElementCreationOptions
    ): HTMLElement {
        const element = originalCreateElement(tagName, options)

        if (tagName.toLowerCase() === "script") {
            const originalSetAttribute = element.setAttribute.bind(element)
            element.setAttribute = function (name: string, value: string) {
                if (
                    name === "src" &&
                    value.includes("duckdb-browser-eh.worker")
                ) {
                    console.log("Intercepting MotherDuck worker script load")
                    value = chrome.runtime.getURL("assets/motherduck-worker.js")
                }
                return originalSetAttribute(name, value)
            }
        }

        return element
    }

    console.log("Script, WASM, and Blob URL interception initialized")
}
