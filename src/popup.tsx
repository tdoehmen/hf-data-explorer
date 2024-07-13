import "./styles.css"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import React, { useEffect, useState } from "react"
import { FaGithub } from "react-icons/fa"
import { FiExternalLink } from "react-icons/fi"
import { MotherDuckClient } from "services/MotherDuckClient"

import { useStorage } from "@plasmohq/storage/hook"

import { setupMotherDuckInterceptor } from "./motherduck-setup"

const DATASETS_URL = "https://huggingface.co/datasets"

const IndexPopup = () => {
    const [currentUrl, setCurrentUrl] = useState<string | null>(null)

    const [loadViewsOnStartup, setLoadViewsOnStartup] = useStorage(
        "loadViewsOnStartup",
        (v) => (v === undefined ? true : v)
    )
    const [mdClient, setMdClient] = useState<MotherDuckClient | null>(null)
    const [queryResult, setQueryResult] = useState<string | null>(null)

    useEffect(() => {
        const initializeAndTest = async () => {
            try {
                console.log("Starting initialization...")
                await getCurrentTabInfo()
                console.log("Tab info retrieved")

                setupMotherDuckInterceptor()
                console.log("MotherDuck interceptor set up")

                await initializeMotherDuckClient()
                console.log("MotherDuck client initialized")

                await runTestQuery()
                console.log("Test query executed")
            } catch (error) {
                console.error(
                    "Error during initialization or test query:",
                    error
                )
            }
        }

        initializeAndTest()
    }, [])

    const getCurrentTabInfo = async () => {
        if (chrome.tabs && chrome.tabs.query) {
            chrome.tabs.query(
                { active: true, currentWindow: true },
                async (tabs) => {
                    if (tabs[0] && tabs[0].url && tabs[0].id) {
                        setCurrentUrl(tabs[0].url)
                    }
                }
            )
        }
    }

    const initializeMotherDuckClient = async () => {
        try {
            console.log("Creating MotherDuck client...")
            const client = new MotherDuckClient({
                mdToken: "<your-token-here>."
            })
            console.log("MotherDuck client created, initializing...")
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(
                    () =>
                        reject(
                            new Error(
                                "MotherDuck client initialization timed out"
                            )
                        ),
                    30000
                )
            )

            await Promise.race([client.initialize(), timeoutPromise])

            console.log("MotherDuck client initialized")
            setMdClient(client)
            console.log("MotherDuck client state updated")
        } catch (error) {
            console.error("Error initializing MotherDuck client:", error)
            throw error
        }
    }

    const runTestQuery = async () => {
        if (mdClient) {
            try {
                console.log("Running test query...")
                const result = await mdClient.queryStream(
                    "SELECT 'Hello from MotherDuck' AS greeting"
                )
                let rows = []
                for await (const batch of result.readRows()) {
                    rows = rows.concat(batch)
                }
                console.log("Query result:", rows)
                setQueryResult(JSON.stringify(rows))
            } catch (error) {
                console.error("Error running query:", error)
                setQueryResult("Error: " + error.message)
            }
        } else {
            console.error("MotherDuck client not initialized")
        }
    }

    return (
        <div className="p-3 bg-white shadow-lg w-72 rounded-lg flex flex-col items-center justify-center">
            <h1 className="text-3xl font-bold text-gray-800">Data Explorer</h1>
            <p>Explore Hugging Face datasets interactively.</p>
            <div className="flex mt-10 flex-col space-y-2">
                {currentUrl?.startsWith(DATASETS_URL) ? (
                    currentUrl === DATASETS_URL ? (
                        <p className="text-lg text-center">
                            Open a dataset to get started.
                        </p>
                    ) : (
                        <div className="space-y-6 mb-6">
                            <div className="flex items-start space-x-3">
                                <Switch
                                    id="load-views"
                                    checked={loadViewsOnStartup}
                                    onCheckedChange={(checked) =>
                                        setLoadViewsOnStartup(checked)
                                    }
                                />
                                <div>
                                    <Label
                                        htmlFor="load-views"
                                        className="text-sm font-medium text-gray-800">
                                        Load Views on Startup
                                    </Label>
                                    <p className="text-xs text-gray-500">
                                        Automatically load configs and splits as
                                        views on startup
                                    </p>
                                </div>
                            </div>
                        </div>
                    )
                ) : (
                    <Button
                        variant="ghost"
                        onClick={() => window.open(DATASETS_URL, "_blank")}>
                        Datasets 🤗 <FiExternalLink className="ml-2" />
                    </Button>
                )}
            </div>
            <Button
                variant="link"
                className="text-xs italic mt-4 text-slate-800"
                onClick={() =>
                    window.open(
                        "https://github.com/cfahlgren1/hf-data-explorer",
                        "_blank"
                    )
                }>
                Contribute <FaGithub className="ml-2" />
            </Button>
            // In your popup component JSX
            <Button onClick={runTestQuery}>Run Test Query</Button>
            {queryResult && (
                <div className="mt-4">
                    <h2>Query Result:</h2>
                    <pre>{queryResult}</pre>
                </div>
            )}
        </div>
    )
}

export default IndexPopup
