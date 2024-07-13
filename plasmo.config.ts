export const extendConfig = (baseConfig) => {
    baseConfig.static = [
        ...(baseConfig.static || []),
        {
            from: "assets",
            to: "assets"
        }
    ]
    return baseConfig
}
