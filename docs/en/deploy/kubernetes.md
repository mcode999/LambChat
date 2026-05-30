# Kubernetes Deployment

Deploy LambChat to a Kubernetes cluster using the provided manifests. The provided
manifest is intended for multi-replica application pods and expects external or
managed MongoDB, Redis, and S3-compatible object storage.

## Quick Start

```bash
# Apply all resources
kubectl apply -f k8s/lambchat.yaml

# Check deployment status
kubectl get pods -n lambchat
kubectl get svc -n lambchat
```

## Architecture

The K8s manifest (`k8s/lambchat.yaml`) creates:

| Resource | Name | Description |
|----------|------|-------------|
| Namespace | `lambchat` | Isolated namespace for all resources |
| Deployment | `lambchat` | LambChat application pods |
| Service | `lambchat` | Application service |

For production scaling, run MongoDB and Redis as managed services or separate
high-availability workloads. Do not use per-pod local uploads for multi-replica
deployments; configure S3-compatible object storage instead.

## Configuration

### Environment Variables

Edit the `lambchat` Deployment in `k8s/lambchat.yaml` to set environment variables:

```yaml
env:
  - name: JWT_SECRET_KEY
    value: "your-stable-secret-key"
  - name: MONGODB_URL
    value: "mongodb://mongo.example.internal:27017"
  - name: REDIS_URL
    value: "redis://redis.example.internal:6379/0"
  - name: TASK_BACKEND
    value: "arq"
  - name: S3_ENABLED
    value: "true"
  - name: ENABLE_LOCAL_FILESYSTEM_FALLBACK
    value: "false"
  - name: APP_BASE_URL
    value: "https://lambchat.example.com"
```

For sensitive values, use Kubernetes Secrets:

```yaml
env:
  - name: LLM_API_KEY
    valueFrom:
      secretKeyRef:
        name: lambchat-secrets
        key: llm-api-key
```

### Ingress

The default manifest exposes a Kubernetes Service. Add an Ingress that matches
your ingress controller when publishing the app externally:

**nginx Ingress example:**

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: lambchat-ingress
  namespace: lambchat
  annotations:
    nginx.ingress.kubernetes.io/proxy-buffering: "off"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "86400"
spec:
  tls:
    - hosts:
        - lambchat.example.com
      secretName: lambchat-tls
  rules:
    - host: lambchat.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: lambchat
                port:
                  number: 8000
```

## Scaling

```bash
# Scale the application
kubectl scale deployment lambchat --replicas=3 -n lambchat
```

Multi-replica deployments require shared backing services:

- MongoDB for persistent application data.
- Redis for pub/sub, WebSocket routing, task queueing, distributed locks, and caches.
- S3-compatible object storage for uploads and generated artifacts.
- Stable shared secrets such as `JWT_SECRET_KEY` and `MCP_ENCRYPTION_SALT`.

Do not use local upload storage or `ENABLE_LOCAL_FILESYSTEM_FALLBACK=true` when
running more than one application pod.

## Managing

```bash
# View pods
kubectl get pods -n lambchat

# View application logs
kubectl logs -f deployment/lambchat -n lambchat

# Restart application
kubectl rollout restart deployment/lambchat -n lambchat

# Delete all resources
kubectl delete -f k8s/lambchat.yaml
```
