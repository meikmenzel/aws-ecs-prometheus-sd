import {
    DescribeClustersCommand,
    DescribeServicesCommand,
    DescribeTasksCommand,
    ECSClient,
    ListServicesCommand,
    ListTagsForResourceCommand,
    ListTasksCommand,
    type Cluster,
    type Service,
    type Task,
} from "@aws-sdk/client-ecs"

export async function getEcsCluster(
    ecsClient: ECSClient,
    clusterName: string,
): Promise<Cluster | undefined> {
    try {
        const data = await ecsClient.send(
            new DescribeClustersCommand({ clusters: [clusterName] }),
        )
        return data.clusters?.[0]
    } catch (error) {
        throw new Error(`Error fetching ECS cluster: ${error}`)
    }
}

export async function getAllServices(
    ecsClient: ECSClient,
    clusterName: string,
): Promise<Service[] | undefined> {
    // List all service ARNs
    const listCommand = new ListServicesCommand({ cluster: clusterName })
    const listResponse = await ecsClient.send(listCommand)
    const serviceArns = listResponse.serviceArns || []
    if (serviceArns.length === 0) {
        return []
    }
    // Describe all services
    const describeCommand = new DescribeServicesCommand({
        cluster: clusterName,
        services: serviceArns,
    })
    const describeResponse = await ecsClient.send(describeCommand)
    return describeResponse.services || []
}

export async function getTasksForService(
    ecsClient: ECSClient,
    clusterName: string,
    serviceArn: string,
): Promise<Task[]> {
    const listCommand = new ListTasksCommand({
        cluster: clusterName,
        serviceName: serviceArn,
    })
    const listResponse = await ecsClient.send(listCommand)
    const taskArns = listResponse.taskArns || []
    if (taskArns.length === 0) return []
    const describeCommand = new DescribeTasksCommand({
        cluster: clusterName,
        tasks: taskArns,
    })
    const describeResponse = await ecsClient.send(describeCommand)
    return describeResponse.tasks || []
}

export async function getServiceTags(ecsClient: ECSClient, serviceArn: string) {
    const command = new ListTagsForResourceCommand({ resourceArn: serviceArn })
    const response = await ecsClient.send(command)
    return response.tags
}
