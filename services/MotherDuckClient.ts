import { MDConnection } from "@motherduck/wasm-client"

export interface MotherDuckClientConfig {
    mdToken: string
    views?: { [key: string]: string[] }
    wasmClientVersion?: string // Optional: Allow user to specify version
}

type SchemaField = {
    name: string
    type: string
    databaseType: string
}

function sanitizeViewName(name: string): string {
    let sanitized = name.replace(/[^a-zA-Z0-9_]/g, "_")
    sanitized = sanitized.toLowerCase()
    return sanitized
}

export class MotherDuckClient {
    private connection: MDConnection | null = null
    private currentResultSet: any = null
    private isQueryRunning: boolean = false
    private isCancelling: boolean = false

    constructor(private config: MotherDuckClientConfig) {}

    async initialize(): Promise<void> {
        const workerCode = `
            importScripts('https://cdn.jsdelivr.net/npm/@motherduck/wasm-client/index_with_arrow.js');
            
            let mdConnection = null;

            self.onmessage = async function(e) {
                const { type, payload } = e.data;

                switch(type) {
                    case 'initialize':
                        mdConnection = MDConnection.create({ mdToken: payload.mdToken });
                        await mdConnection.isInitialized();
                        self.postMessage({ type: 'initialized' });
                        break;
                    case 'query':
                        if (!mdConnection) {
                            self.postMessage({ type: 'error', error: 'MotherDuck not initialized' });
                            return;
                        }
                        try {
                            const result = await mdConnection.executeQuery(payload.query);
                            self.postMessage({ type: 'queryResult', result });
                        } catch (error) {
                            self.postMessage({ type: 'error', error: error.message });
                        }
                        break;
                    case 'cancel':
                        if (mdConnection) {
                            await mdConnection.cancelQuery();
                            self.postMessage({ type: 'cancelled' });
                        }
                        break;
                    case 'close':
                        if (mdConnection) {
                            await mdConnection.close();
                            mdConnection = null;
                            self.postMessage({ type: 'closed' });
                        }
                        break;
                }
            };
        `

        const workerBlob = new Blob([workerCode], {
            type: "application/javascript"
        })
        const workerUrl = URL.createObjectURL(workerBlob)

        const worker = new Worker(workerUrl)

        worker.onmessage = (event) => {
            if (event.data.type === "initialized") {
                this.connection = { worker } as any // Type assertion as MDConnection for compatibility
                console.log("MotherDuck initialized")
            }
        }

        worker.postMessage({
            type: "initialize",
            payload: { mdToken: this.config.mdToken }
        })

        await new Promise<void>((resolve) => {
            const checkInitialized = setInterval(() => {
                if (this.connection) {
                    clearInterval(checkInitialized)
                    resolve()
                }
            }, 100)
        })

        URL.revokeObjectURL(workerUrl)

        await this.loadConfig(this.config || {})
    }

    private async executeQuery(query: string): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.connection) {
                reject(new Error("MotherDuck not initialized"))
                return
            }

            const messageHandler = (event) => {
                if (event.data.type === "queryResult") {
                    this.connection.worker.removeEventListener(
                        "message",
                        messageHandler
                    )
                    resolve(event.data.result)
                } else if (event.data.type === "error") {
                    this.connection.worker.removeEventListener(
                        "message",
                        messageHandler
                    )
                    reject(new Error(event.data.error))
                }
            }

            this.connection.worker.addEventListener("message", messageHandler)
            this.connection.worker.postMessage({
                type: "query",
                payload: { query }
            })
        })
    }

    async loadConfig(config: MotherDuckClientConfig): Promise<void> {
        if (!this.connection) {
            throw new Error("MotherDuck not initialized")
        }

        if (config.views) {
            const invalidKeywords = (
                await this.executeQuery(
                    "SELECT keyword_name FROM duckdb_keywords() WHERE keyword_category = 'reserved';"
                )
            ).data
                .toRows()
                .map((row) => row[0])

            for (const [viewName, filePaths] of Object.entries(config.views)) {
                const filePathsString = filePaths
                    .map((path) => `'${path}'`)
                    .join(", ")
                let sanitizedViewName = sanitizeViewName(viewName)

                if (invalidKeywords.includes(sanitizedViewName)) {
                    sanitizedViewName += "_view"
                }

                await this.executeQuery(
                    `CREATE OR REPLACE VIEW ${sanitizedViewName} AS SELECT * FROM read_parquet([${filePathsString}]);`
                )
            }
        }
    }

    async queryStream(query: string, params?: any[]) {
        if (this.isQueryRunning) {
            throw new Error("A query is already running")
        }

        this.isQueryRunning = true

        try {
            let result
            if (params?.length) {
                result = await this.executeQuery(
                    `EXECUTE(${query}, ${JSON.stringify(params)})`
                )
            } else {
                result = await this.executeQuery(query)
            }

            this.currentResultSet = result

            const schema: SchemaField[] = result.schema.fields.map((field) => ({
                name: field.name,
                type: field.type.name,
                databaseType: field.type.name
            }))

            return {
                schema,
                async *readRows() {
                    yield result.data.toRows().map((row) => {
                        const jsonRow = {}
                        for (let i = 0; i < schema.length; i++) {
                            jsonRow[schema[i].name] = row[i]
                        }
                        return jsonRow
                    })
                }
            }
        } finally {
            this.isQueryRunning = false
        }
    }

    async cancelQuery(): Promise<void> {
        if (this.connection && this.isQueryRunning) {
            this.isCancelling = true
            try {
                await new Promise<void>((resolve) => {
                    const messageHandler = (event) => {
                        if (event.data.type === "cancelled") {
                            this.connection.worker.removeEventListener(
                                "message",
                                messageHandler
                            )
                            resolve()
                        }
                    }
                    this.connection.worker.addEventListener(
                        "message",
                        messageHandler
                    )
                    this.connection.worker.postMessage({ type: "cancel" })
                })
            } finally {
                this.isQueryRunning = false
                this.isCancelling = false
                this.currentResultSet = null
            }
        }
    }

    getQueryStatus(): { isRunning: boolean; isCancelling: boolean } {
        return {
            isRunning: this.isQueryRunning,
            isCancelling: this.isCancelling
        }
    }

    async close(): Promise<void> {
        if (this.connection) {
            await new Promise<void>((resolve) => {
                const messageHandler = (event) => {
                    if (event.data.type === "closed") {
                        this.connection.worker.removeEventListener(
                            "message",
                            messageHandler
                        )
                        resolve()
                    }
                }
                this.connection.worker.addEventListener(
                    "message",
                    messageHandler
                )
                this.connection.worker.postMessage({ type: "close" })
            })
            this.connection = null
        }
    }

    async getTables(): Promise<string[]> {
        if (!this.connection) {
            throw new Error("MotherDuck not initialized")
        }

        const result = await this.executeQuery("SHOW TABLES")
        return result.data.toRows().map((row) => row[0] as string)
    }
}
