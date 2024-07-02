import { sendToBackground } from "@plasmohq/messaging"

export interface MotherDuckClientConfig {
    mdToken: string
    views?: { [key: string]: string[] }
}

type SchemaField = {
    name: string
    type: string
    databaseType: string
}

interface QueryResult {
    schema: SchemaField[]
    readRows: () => AsyncGenerator<any[], void, unknown>
}

export class MotherDuckClient {
    private isQueryRunning: boolean = false
    private isCancelling: boolean = false

    constructor(private config: MotherDuckClientConfig) {}

    async initialize(): Promise<void> {
        console.log("MotherDuckClient: Initializing")
        const response = await sendToBackground({
            name: "initializeMotherDuck",
            body: { mdToken: this.config.mdToken }
        })

        console.log("MotherDuckClient: Initialization response", response)

        if (!response.success) {
            console.error(
                "MotherDuckClient: Initialization failed",
                response.error
            )
            throw new Error(response.error)
        }

        await this.loadConfig(this.config)
        console.log("MotherDuckClient: Initialized successfully")
    }

    private async loadConfig(config: MotherDuckClientConfig): Promise<void> {
        if (config.views) {
            for (const [viewName, filePaths] of Object.entries(config.views)) {
                const filePathsString = filePaths
                    .map((path) => `'${path}'`)
                    .join(", ")
                await this.executeQuery(
                    `CREATE OR REPLACE VIEW ${viewName} AS SELECT * FROM read_parquet([${filePathsString}]);`
                )
            }
        }
    }

    private async executeQuery(query: string): Promise<any> {
        console.log("MotherDuckClient: Executing query", query)
        const response = await sendToBackground({
            name: "executeQuery",
            body: { query }
        })

        console.log("MotherDuckClient: Query response", response)

        if (!response.success) {
            console.error("MotherDuckClient: Query failed", response.error)
            throw new Error(response.error)
        }

        return response.result
    }

    async queryStream(query: string, params?: any[]): Promise<QueryResult> {
        console.log("queryStream called with:", query, params)
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

            console.log("Query result:", result)

            const schema: SchemaField[] = result.schema.fields.map((field) => ({
                name: field.name,
                type: field.type.name,
                databaseType: field.type.name
            }))

            return {
                schema,
                readRows: async function* () {
                    yield result.data.toRows()
                }
            }
        } finally {
            this.isQueryRunning = false
        }
    }

    async cancelQuery(): Promise<void> {
        if (this.isQueryRunning) {
            this.isCancelling = true
            try {
                await sendToBackground({ name: "cancelQuery" })
            } finally {
                this.isQueryRunning = false
                this.isCancelling = false
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
        this.isQueryRunning = false
        this.isCancelling = false
        await sendToBackground({ name: "closeConnection" })
    }

    async getTables(): Promise<string[]> {
        const result = await this.executeQuery("SHOW TABLES")
        return result.data.toRows().map((row) => row.name as string)
    }
}
