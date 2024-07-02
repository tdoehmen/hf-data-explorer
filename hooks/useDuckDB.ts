import { useEffect, useState } from "react"

import { DuckDBClient, DuckDBClientConfig } from "../services/DuckDBClient"
import {
    MotherDuckClient,
    MotherDuckClientConfig
} from "../services/MotherDuckClient"

type ClientConfig = DuckDBClientConfig | MotherDuckClientConfig

const useDuckDB = (
    config: ClientConfig = { mdToken: "xxxx" },
    useMotherDuck: boolean = true
) => {
    const [client, setClient] = useState<
        DuckDBClient | MotherDuckClient | null
    >(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let isMounted = true

        const initClient = async () => {
            setLoading(true)
            if (client) {
                await client.close().catch((error) => {
                    console.error("Error closing previous client:", error)
                })
            }

            try {
                const newClient = useMotherDuck
                    ? new MotherDuckClient(config as MotherDuckClientConfig)
                    : new DuckDBClient(config as DuckDBClientConfig)
                await newClient.initialize()
                if (isMounted) {
                    setClient(newClient)
                    setLoading(false)
                }
            } catch (error) {
                console.error("Error initializing client:", error)
                if (isMounted) {
                    setLoading(false)
                }
            }
        }

        initClient()

        return () => {
            isMounted = false
            if (client) {
                client.close().catch((error) => {
                    console.error("Error closing client:", error)
                })
            }
        }
    }, [JSON.stringify(config)])

    return { client, loading }
}

export { DuckDBClient, MotherDuckClient, useDuckDB }
