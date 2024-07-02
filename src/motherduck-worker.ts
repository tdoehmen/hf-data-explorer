import { MDConnection } from "@motherduck/wasm-client"

let mdConnection: MDConnection | null = null

async function initialize(mdToken: string) {
    console.log("Worker: Initializing MotherDuck")
    mdConnection = MDConnection.create({ mdToken })
    await mdConnection.isInitialized()
    console.log("Worker: MotherDuck initialized")
    return { success: true }
}

async function executeQuery(query: string) {
    console.log("Worker: Executing query", query)
    if (!mdConnection) {
        console.error("Worker: MotherDuck not initialized")
        return { success: false, error: "MotherDuck not initialized" }
    }
    try {
        const result = await mdConnection.executeQuery(query)
        console.log("Worker: Query executed successfully", result)
        return { success: true, result }
    } catch (error) {
        console.error("Worker: Error executing query", error)
        return { success: false, error: error.message }
    }
}

async function cancelQuery() {
    if (!mdConnection) {
        return { success: false, error: "MotherDuck not initialized" }
    }
    try {
        await mdConnection.cancelQuery()
        return { success: true }
    } catch (error) {
        return { success: false, error: error.message }
    }
}

function close() {
    mdConnection = null
    return { success: true }
}

export { initialize, executeQuery, cancelQuery, close }
