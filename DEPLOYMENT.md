# Deployment Guide for Config Comparator

This document provides instructions for deploying the Config Comparator application using Docker and Kubernetes.

## Overview

Config Comparator is a React/Node.js application that allows users to compare Kubernetes secrets and configmaps between different clusters. The application consists of:

- **Frontend**: React application built with Create React App
- **Backend**: Node.js/Express server with TypeScript
- **Single Container**: Both frontend and backend are served from a single Docker container

## Prerequisites

- Docker installed and running
- Kubernetes cluster access (for Kubernetes deployment)
- kubectl configured with cluster access
- Node.js 18+ (for local development)

## Docker Deployment

### Building the Docker Image

```bash
# Build the Docker image
docker build -t config-compartor:latest .

# Tag for registry (optional)
docker tag config-compartor:latest your-registry/config-compartor:latest

# Push to registry (optional)
docker push your-registry/config-compartor:latest
```

### Running with Docker Compose

For local development and testing:

```bash
# Run the application
docker-compose up -d

# Run with nginx reverse proxy
docker-compose --profile with-nginx up -d

# View logs
docker-compose logs -f config-compartor

# Stop the application
docker-compose down
```

The application will be available at:
- Direct access: http://localhost:3001
- With nginx: http://localhost:80

### Running with Docker directly

```bash
# Run the container
docker run -d \
  --name config-compartor \
  -p 3001:3001 \
  -e PORT=3001 \
  -e NODE_ENV=production \
  config-compartor:latest

# View logs
docker logs -f config-compartor

# Stop and remove
docker stop config-compartor && docker rm config-compartor
```

## Kubernetes Deployment

### Deploy to Kubernetes

1. **Update the image reference** in `k8s-deployment.yaml`:
   ```yaml
   image: your-registry/config-compartor:latest
   ```

2. **Deploy the application**:
   ```bash
   # Apply all Kubernetes resources
   kubectl apply -f k8s-deployment.yaml
   
   # Check deployment status
   kubectl get deployments
   kubectl get pods -l app=config-compartor
   kubectl get services
   ```

3. **Access the application**:
   ```bash
   # Port forward for local access
   kubectl port-forward service/config-compartor-service 8080:80
   
   # Application will be available at http://localhost:8080
   ```

### Kubernetes Resources

The deployment includes:

- **ConfigMap**: Environment variables (PORT, NODE_ENV)
- **Deployment**: 2 replicas with resource limits and health checks
- **Service**: ClusterIP service exposing port 80
- **Ingress** (optional): External access with TLS support

### Customization

#### Environment Variables

Update the ConfigMap in `k8s-deployment.yaml`:

```yaml
data:
  PORT: "3001"
  NODE_ENV: "production"
  # Add more environment variables as needed
```

#### Resource Limits

Adjust resource limits in the Deployment:

```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "250m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

#### Ingress Configuration

Update the Ingress section for your domain:

```yaml
spec:
  tls:
  - hosts:
    - your-domain.com
    secretName: your-tls-secret
  rules:
  - host: your-domain.com
```

## Health Checks

The application includes health check endpoints:

- **Endpoint**: `/api/health`
- **Response**: `{"status": "ok", "timestamp": "2025-08-12T13:13:00.000Z"}`

## Monitoring

### Kubernetes

```bash
# Check pod status
kubectl get pods -l app=config-compartor

# View pod logs
kubectl logs -f deployment/config-compartor

# Check service endpoints
kubectl get endpoints config-compartor-service

# Describe deployment for troubleshooting
kubectl describe deployment config-compartor
```

### Docker

```bash
# Check container status
docker ps | grep config-compartor

# View container logs
docker logs -f config-compartor

# Check container health
docker inspect config-compartor | grep Health
```

## Troubleshooting

### Common Issues

1. **Build failures**:
   - Ensure all package.json files are present
   - Check Node.js version compatibility
   - Verify frontend builds successfully

2. **Container startup issues**:
   - Check environment variables
   - Verify port configuration
   - Review container logs

3. **Kubernetes deployment issues**:
   - Check image availability
   - Verify resource limits
   - Check service selectors match pod labels

### Debug Commands

```bash
# Docker debug
docker run -it --entrypoint /bin/sh config-compartor:latest

# Kubernetes debug
kubectl exec -it deployment/config-compartor -- /bin/sh
kubectl describe pod <pod-name>
kubectl get events --sort-by=.metadata.creationTimestamp
```

## Security Considerations

- Application runs as non-root user (app:nodejs)
- Resource limits prevent resource exhaustion
- Health checks ensure container availability
- TLS configuration available for Ingress

## Development

For local development without Docker:

```bash
# Install dependencies
npm install
npm run install:frontend

# Start development servers
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Scaling

To scale the Kubernetes deployment:

```bash
# Scale to 3 replicas
kubectl scale deployment config-compartor --replicas=3

# Auto-scaling (requires metrics server)
kubectl autoscale deployment config-compartor --min=2 --max=10 --cpu-percent=80
```
