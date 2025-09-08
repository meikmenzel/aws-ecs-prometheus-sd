VERSION=$1

# Build container
docker build --platform=linux/amd64 -t meikmenzel/aws-ecs-prometheus-sd:${VERSION} .

# Upload container to registry
docker push meikmenzel/aws-ecs-prometheus-sd:${VERSION}
