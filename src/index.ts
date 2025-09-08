import "dotenv/config"
import { checkEnv, groupByServiceName } from "./helper.js"
import express from "express"
import {
    ECSClient,
    type Cluster,
    type Service,
    type Task,
} from "@aws-sdk/client-ecs"
import {
    getEcsCluster,
    getAllServices,
    getTasksForService,
    getServiceTags,
} from "./ecs.js"
import type ITarget from "./target.interface.ts"

let ecsClient: ECSClient

let targetsResponse: ITarget[] = []

async function run() {
    console.log("Starting AWS ECS Prometheus Service Discovery...")

    checkEnv()

    const app = express()
    const port = 80

    app.listen(port, () => {
        console.log(`Server is running on port ${port}`)
    })

    app.get("/targets", async (_req, res) => {
        res.setHeader("Content-Type", "application/json")
        res.send(JSON.stringify(targetsResponse, null, 4))
    })

    // wait 2 seconds to ensure everything is ready
    await new Promise((resolve) => setTimeout(resolve, 2000))

    console.log("Creating ECS client...")
    ecsClient = new ECSClient({
        region: process.env.AWS_REGION,
        credentials:
            process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
                ? {
                      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                  }
                : undefined,
    })

    if (!ecsClient) {
        console.error("Failed to create ECS client. Check your configuration.")
        process.exit(1)
    }

    console.log("ECS client created successfully")

    console.log("Fetching ECS cluster...")

    let cluster: Cluster | undefined | void

    while (!cluster) {
        await getEcsCluster(ecsClient, process.env.CLUSTER_NAME as string)
            .then((result: any) => {
                cluster = result
            })
            .catch((error: any) => {
                console.error("Error fetching ECS cluster:", error)
            })

        if (!cluster) console.log("Cluster not found, retrying in 5 seconds...")
        await new Promise((resolve) => setTimeout(resolve, 5000))
    }

    console.log(
        `Found ECS Cluster: ${cluster.clusterName} - Status: ${cluster.status} - Active Services: ${cluster.activeServicesCount} - Running Tasks: ${cluster.runningTasksCount}`,
    )

    while (true) {
        let services: Service[] | undefined | void

        while (!services) {
            await getAllServices(ecsClient, cluster.clusterName as string)
                .then((result: any) => {
                    services = result
                })
                .catch((error: any) => {
                    console.error("Error fetching ECS services:", error)
                })

            if (!services)
                console.log("Services not found, retrying in 5 seconds...")
            await new Promise((resolve) => setTimeout(resolve, 5000))
        }

        console.log(
            `Found ${services.length} services in the cluster ${cluster.clusterName}.`,
        )

        for (const service of services) {
            const tags = await getServiceTags(
                ecsClient,
                service.serviceArn as string,
            )
            service.tags = tags
        }

        const targetServices = services.filter((service) => {
            return service.tags?.some(
                (tag) =>
                    tag.key === "PROMETHEUS_TARGET" && tag.value === "true",
            )
        })

        const tasks: Task[] = []

        const response = []

        for (const service of targetServices) {
            console.log(
                `Target service: ${service.serviceName} - Status: ${service.status} - Desired Count: ${service.desiredCount} - Running Count: ${service.runningCount}`,
            )

            const foundTasks = await getTasksForService(
                ecsClient,
                cluster.clusterName as string,
                service.serviceName as string,
            )

            tasks.push(...foundTasks)

            const metricPort =
                service.tags?.find(
                    (tag) => tag.key === "PROMETHEUS_METRIC_PORT",
                )?.value || "80"

            response.push(
                ...foundTasks.map((task: any) => ({
                    targets: [
                        task.attachments
                            ?.flatMap((att: any) =>
                                att.details?.filter(
                                    (detail: any) =>
                                        detail.name === "privateIPv4Address",
                                ),
                            )
                            .map((detail: any) => detail?.value)
                            .filter((ip: any): ip is string => !!ip)
                            .map((ip: any) => `${ip}:${metricPort}`)
                            .join(",") || "unknown",
                    ],
                    labels: {
                        clusterName: cluster?.clusterName || "unknown",
                        serviceName: service.serviceName || "unknown",
                        taskArn: task.taskArn || "unknown",
                        taskDefinitionArn: task.taskDefinitionArn || "unknown",
                        ...Object.fromEntries(
                            (service.tags ?? [])
                                .filter(
                                    (tag) =>
                                        tag.key !== "PROMETHEUS_METRIC_PORT" &&
                                        tag.key !== "PROMETHEUS_TARGET",
                                )
                                .map((tag) => [tag.key, tag.value]),
                        ),
                    },
                })),
            )
        }

        targetsResponse = groupByServiceName(response)

        const waitSeconds = process.env.CHECK_INTERVAL
            ? parseInt(process.env.CHECK_INTERVAL)
            : 30

        console.log(
            `Total target tasks found: ${tasks.length} - Waiting ${waitSeconds} seconds for next update.`,
        )

        await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000))
    }
}
await run()
