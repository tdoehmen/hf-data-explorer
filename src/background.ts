import type { PlasmoMessaging } from "@plasmohq/messaging"

import {
    cancelQuery,
    close,
    executeQuery,
    initialize
} from "./motherduck-worker"

let worker: Worker | null = null

const initializeWorker = () => {
    console.log("Initializing worker")
    if (worker) {
        console.log("Worker already exists")
        return
    }

    worker = new Worker(
        new URL("./motherduck-worker-entry.ts", import.meta.url),
        { type: "module" }
    )
    console.log("Worker created")

    worker.onmessage = (event) => {
        const { type, success, result, error } = event.data
        console.log("Worker message received:", {
            type,
            success,
            result,
            error
        })
    }

    worker.onerror = (error) => {
        console.error("Worker error:", error)
    }
}

const sendWorkerMessage = (message: any): Promise<any> => {
    return new Promise((resolve, reject) => {
        if (!worker) {
            console.error("Worker not initialized")
            reject(new Error("Worker not initialized"))
            return
        }

        console.log("Sending message to worker:", message)

        const messageHandler = (event) => {
            const { type, success, result, error } = event.data
            console.log("Received response from worker:", {
                type,
                success,
                result,
                error
            })
            if (type === message.type) {
                worker.removeEventListener("message", messageHandler)
                if (success) {
                    resolve(result)
                } else {
                    reject(new Error(error))
                }
            }
        }

        worker.addEventListener("message", messageHandler)
        worker.postMessage(message)
    })
}

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
    console.log("Background received message:", req)

    switch (req.name) {
        case "initializeMotherDuck":
            try {
                console.log("Initializing MotherDuck")
                initializeWorker()
                const result = await sendWorkerMessage({
                    type: "initialize",
                    payload: { mdToken: req.body.mdToken }
                })
                console.log("MotherDuck initialized:", result)
                res.send({ success: true })
            } catch (error) {
                console.error("Error initializing MotherDuck:", error)
                res.send({ success: false, error: error.message })
            }
            break

        case "executeQuery":
            try {
                console.log("Executing query:", req.body.query)
                const result = await sendWorkerMessage({
                    type: "executeQuery",
                    payload: { query: req.body.query }
                })
                console.log("Query result:", result)
                res.send({ success: true, result })
            } catch (error) {
                console.error("Error executing query:", error)
                res.send({ success: false, error: error.message })
            }
            break

        case "cancelQuery":
            try {
                await sendWorkerMessage({ type: "cancelQuery" })
                res.send({ success: true })
            } catch (error) {
                console.error("Error cancelling query:", error)
                res.send({ success: false, error: error.message })
            }
            break

        case "closeConnection":
            try {
                if (worker) {
                    await sendWorkerMessage({ type: "close" })
                    worker.terminate()
                    worker = null
                }
                res.send({ success: true })
            } catch (error) {
                console.error("Error closing connection:", error)
                res.send({ success: false, error: error.message })
            }
            break

        default:
            res.send({ success: false, error: "Unknown message type" })
    }
}

export default handler
