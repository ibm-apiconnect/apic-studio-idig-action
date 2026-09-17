# Self-hosted GitHub Actions runner

This guide explains how to deploy a self-hosted GitHub Actions runner inside your cluster. This is only required when your IDIG broker is on a private network that is not reachable from GitHub's cloud runners. If your cluster is publicly reachable, use `idig_publish_public.yml` instead.

The runner pod runs entirely inside the cluster and communicates with GitHub outbound over HTTPS (port 443). It does not require any inbound connectivity to the cluster.

---

- [OpenShift (OCP)](#openshift-ocp)
- [Vanilla Kubernetes](#vanilla-kubernetes)

---

## OpenShift (OCP)

### Prerequisites

- `oc` CLI logged in with access to your namespace
- Cluster has outbound internet access to `github.com` on port 443
- You are running commands from the root of the repository you want to set the workflow in

> **Note:** Replace `<namespace>` throughout this section with the OCP namespace where your IDIG instance is deployed.

### Step 1 — Get a runner registration token

Go to your GitHub repository → **Settings → Actions → Runners → New self-hosted runner**.

Select **Linux** and **x64**. GitHub will display a `config.sh` command that includes a `--token` argument. Copy the token value — it looks like `AABCD1234XXXX...`.

> **Note:** This token is single-use and expires after 1 hour. Generate it immediately before deploying the runner pod.

### Step 2 — Create an ImageStream

```bash
oc create imagestream github-runner -n <namespace>
```

### Step 3 — Build the runner image inside OCP

The runner image must be built inside OCP because the `Containerfile` installs packages at build time using `dnf` (which requires root). This is not permitted at pod runtime under OCP's restricted security policy.

```bash
oc new-build \
  --name=github-runner \
  --binary \
  --strategy=docker \
  --to=github-runner:latest \
  --docker-image=registry.redhat.io/ubi9/ubi:latest \
  -n <namespace>

oc start-build github-runner \
  --from-dir=docs/runner \
  --follow \
  -n <namespace>
```

The build streams logs to your terminal. Wait for `Push successful` before continuing.

### Step 4 — Store the registration token and repo URL

```bash
oc create secret generic github-runner-secret \
  --from-literal=token=<paste-token-here> \
  --from-literal=url=https://github.com/<your-org>/<your-repo> \
  -n <namespace>
```

### Step 5 — Deploy the runner

```bash
oc apply -n <namespace> -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: github-runner
spec:
  replicas: 1
  selector:
    matchLabels:
      app: github-runner
  template:
    metadata:
      labels:
        app: github-runner
    spec:
      securityContext:
        runAsNonRoot: true
        seccompProfile:
          type: RuntimeDefault
      containers:
      - name: runner
        image: image-registry.openshift-image-registry.svc:5000/<namespace>/github-runner:latest
        securityContext:
          allowPrivilegeEscalation: false
          capabilities:
            drop: ["ALL"]
        env:
        - name: RUNNER_TOKEN
          valueFrom:
            secretKeyRef:
              name: github-runner-secret
              key: token
        - name: RUNNER_URL
          valueFrom:
            secretKeyRef:
              name: github-runner-secret
              key: url
        resources:
          requests:
            cpu: 100m
            memory: 256Mi
          limits:
            cpu: 500m
            memory: 512Mi
EOF
```

### Step 6 — Verify

```bash
oc logs -f deployment/github-runner -n <namespace>
```

Wait for:

```
Listening for Jobs
```

The runner will appear as **Idle** under **Settings → Actions → Runners** in your GitHub repository.

### Updating the runner after a pod restart

The registration token is single-use. If the pod restarts (e.g. after a node reboot or `oc rollout restart`), the runner will fail to re-register with the old token. To update it:

```bash
# 1. Generate a new token from GitHub:
#    Settings → Actions → Runners → New self-hosted runner → copy --token value

# 2. Delete and recreate the secret
oc delete secret github-runner-secret -n <namespace>
oc create secret generic github-runner-secret \
  --from-literal=token=<new-token> \
  --from-literal=url=https://github.com/<your-org>/<your-repo> \
  -n <namespace>

# 3. Restart the deployment to pick up the new secret
oc rollout restart deployment/github-runner -n <namespace>
```

### Rebuilding the runner image

If you update `docs/runner/Containerfile` (e.g. to bump the runner version), also update `docs/runner/Dockerfile` to match (they must be identical — `oc new-build --strategy=docker` requires the file to be named `Dockerfile`), then rebuild:

```bash
oc start-build github-runner \
  --from-dir=docs/runner \
  --follow \
  -n <namespace>

oc rollout restart deployment/github-runner -n <namespace>
```

---

## Vanilla Kubernetes

> **Note:** These instructions have not yet been validated against a live cluster. Steps are correct in principle but may need adjusting depending on your cluster's configuration.

### Prerequisites

- `kubectl` CLI configured for your cluster
- A container registry that your cluster can pull images from (e.g. Docker Hub, GHCR, or a private registry)
- Docker or Podman available on your local machine to build and push the image
- Cluster has outbound internet access to `github.com` on port 443

> **Note:** Replace `<namespace>`, `<registry>`, `<your-org>`, and `<your-repo>` throughout this section with your own values.

### Step 1 — Get a runner registration token

Go to your GitHub repository → **Settings → Actions → Runners → New self-hosted runner**.

Select **Linux** and **x64**. Copy the token value from the `--token` argument in the displayed `config.sh` command.

> **Note:** This token is single-use and expires after 1 hour. Generate it immediately before deploying the runner pod.

### Step 2 — Build and push the runner image

```bash
docker build -t <registry>/<your-org>/github-runner:latest -f docs/runner/Containerfile docs/runner
docker push <registry>/<your-org>/github-runner:latest
```

### Step 3 — Store the registration token and repo URL

```bash
kubectl create secret generic github-runner-secret \
  --from-literal=token=<paste-token-here> \
  --from-literal=url=https://github.com/<your-org>/<your-repo> \
  -n <namespace>
```

### Step 4 — Deploy the runner

```bash
kubectl apply -n <namespace> -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: github-runner
spec:
  replicas: 1
  selector:
    matchLabels:
      app: github-runner
  template:
    metadata:
      labels:
        app: github-runner
    spec:
      securityContext:
        runAsNonRoot: true
      containers:
      - name: runner
        image: <registry>/<your-org>/github-runner:latest
        env:
        - name: RUNNER_TOKEN
          valueFrom:
            secretKeyRef:
              name: github-runner-secret
              key: token
        - name: RUNNER_URL
          valueFrom:
            secretKeyRef:
              name: github-runner-secret
              key: url
        resources:
          requests:
            cpu: 100m
            memory: 256Mi
          limits:
            cpu: 500m
            memory: 512Mi
EOF
```

### Step 5 — Verify

```bash
kubectl logs -f deployment/github-runner -n <namespace>
```

Wait for `Listening for Jobs`. The runner will appear as **Idle** under **Settings → Actions → Runners** in your GitHub repository.

### Updating the runner after a pod restart

```bash
# 1. Generate a new token from GitHub:
#    Settings → Actions → Runners → New self-hosted runner → copy --token value

# 2. Delete and recreate the secret
kubectl delete secret github-runner-secret -n <namespace>
kubectl create secret generic github-runner-secret \
  --from-literal=token=<new-token> \
  --from-literal=url=https://github.com/<your-org>/<your-repo> \
  -n <namespace>

# 3. Restart the deployment to pick up the new secret
kubectl rollout restart deployment/github-runner -n <namespace>
```

---

## Production setup

For a production deployment where token expiry and pod restarts are a concern, use the [Actions Runner Controller](https://github.com/actions/actions-runner-controller). It manages runner lifecycle, token renewal, and scaling automatically and works on both OCP and vanilla Kubernetes.
