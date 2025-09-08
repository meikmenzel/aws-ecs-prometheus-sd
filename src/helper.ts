export function checkEnv(): void {
    const requiredVars = ["CLUSTER_NAME"]

    let envIsMissing = false

    for (const varName of requiredVars) {
        if (!process.env[varName]) {
            console.log(
                `Environment variable ${varName} is required but not set.`,
            )
            envIsMissing = true
        }
    }

    if (envIsMissing) process.exit(1)
}

export function groupByServiceName(
    response: Array<{ targets: string[]; labels: any }>,
) {
    const map = new Map<string, { targets: string[]; labels: any }>()
    for (const entry of response) {
        const serviceName = entry.labels.serviceName
        if (!map.has(serviceName)) {
            const { taskArn, taskDefinitionArn, ...restLabels } = entry.labels
            map.set(serviceName, {
                targets: [...entry.targets],
                labels: {
                    serviceName,
                    taskArn,
                    taskDefinitionArn,
                    ...restLabels,
                },
            })
        } else {
            map.get(serviceName)!.targets.push(...entry.targets)
        }
    }
    return Array.from(map.values())
}
