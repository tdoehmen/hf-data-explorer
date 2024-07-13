import { MDConnection } from "@motherduck/wasm-client"

export interface MotherDuckClientConfig {
    mdToken: string
    views?: { [key: string]: string[] }
}

type SchemaField = {
    name: string
    type: string
    databaseType: string
}

export class MotherDuckClient {
    private connection: MDConnection | null = null
    private isQueryRunning: boolean = false
    private isCancelling: boolean = false
    private currentQueryId: string | null = null

    constructor(private config: MotherDuckClientConfig) {}

    async initialize(): Promise<void> {
        this.connection = MDConnection.create({
            mdToken: this.config.mdToken
        })

        await this.connection.isInitialized()
        await this.loadConfig(this.config)
    }

    private async loadConfig(config: MotherDuckClientConfig): Promise<void> {
        if (!this.connection) {
            throw new Error("Connection not initialized")
        }

        if (config.views) {
            for (const [viewName, filePaths] of Object.entries(config.views)) {
                const filePathsString = filePaths
                    .map((path) => `'${path}'`)
                    .join(", ")
                await this.connection.executeQuery(
                    `CREATE OR REPLACE VIEW ${viewName} AS SELECT * FROM read_parquet([${filePathsString}]);`
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
                result = await this.connection.evaluatePreparedStatement(
                    query,
                    params
                )
            } else {
                this.currentQueryId = this.connection.enqueueQuery(query)
                result = await this.connection.evaluateQueuedQuery(
                    this.currentQueryId
                )
            }

            if (result.type !== "streaming") {
                throw new Error("Expected streaming result")
            }

            const schema: SchemaField[] = result.schema.fields.map((field) => ({
                name: field.name,
                type: field.type.name,
                databaseType: field.type.name
            }))

            return {
                schema,
                async *readRows() {
                    const reader = result.dataReader
                    while (true) {
                        const batch = await reader.read(2048)
                        if (!batch) break
                        yield batch.toRows().map((row) => {
                            const jsonRow = {}
                            for (let i = 0; i < schema.length; i++) {
                                jsonRow[schema[i].name] = row[i]
                            }
                            return jsonRow
                        })
                    }
                }
            }
        } finally {
            this.isQueryRunning = false
            this.currentQueryId = null
        }
    }

    async cancelQuery(): Promise<void> {
        if (this.connection && this.isQueryRunning && this.currentQueryId) {
            this.isCancelling = true
            try {
                await this.connection.cancelQuery(this.currentQueryId)
            } finally {
                this.isQueryRunning = false
                this.isCancelling = false
                this.currentQueryId = null
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
        // MotherDuck WASM client doesn't have an explicit close method
        // We'll reset our internal state
        this.connection = null
        this.isQueryRunning = false
        this.isCancelling = false
        this.currentQueryId = null
    }

    async getTables(): Promise<string[]> {
        if (!this.connection) {
            throw new Error("Connection not initialized")
        }

        const result = await this.connection.executeQuery("SHOW TABLES")
        return result.data.toRows().map((row) => row.name as string)
    }
}
