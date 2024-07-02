/// <reference lib="webworker" />

declare const self: DedicatedWorkerGlobalScope

self.onmessage = async (event) => {
    console.log("Worker entry: Received message", event.data)
    const { type, payload } = event.data

    try {
        let result
        switch (type) {
            case "initialize":
                console.log("Worker entry: Initializing")
                result = await initialize(payload.mdToken)
                break
            case "executeQuery":
                console.log("Worker entry: Executing query")
                result = await executeQuery(payload.query)
                break
            // ... other cases ...
        }
        console.log("Worker entry: Sending response", { type, ...result })
        self.postMessage({ type, ...result })
    } catch (error) {
        console.error("Worker entry: Error", error)
        self.postMessage({ type, success: false, error: error.message })
    }
}

export {}
