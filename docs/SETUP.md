# Setup guide - publishing AI assets to a standalone IDIG instance

This guide covers everything needed to connect a GitHub repository to a standalone IDIG instance so that pushing changes automatically publishes AI assets to the broker.

**Prerequisites:** IDIG is already deployed on your cluster via the `DatapowerInteractGatewayCluster` CR and the broker route is reachable.

---

## 1. Get the IDIG credentials

The broker admin credentials are stored in a secret created by the IDIG operator. Decode them:

```bash
oc get secret idig-admin-pass -n <namespace> -o json | \
  jq -r '.data | to_entries[] | "\(.key): \(.value | @base64d)"'
```

Note the `username` and `password` values - you will store these as GitHub secrets.

---

## 2. Add GitHub secrets

Go to your GitHub repository → **Settings → Secrets and variables → Actions → New repository secret**.

Add the following two secrets:

| Secret name | Value |
|---|---|
| `IDIG_USERNAME` | Username decoded from the secret above |
| `IDIG_PASSWORD` | Password decoded from the secret above |

> Store the decoded plaintext values - not the base64-encoded strings from the secret.

---

## 3. Choose your workflow variant

There are two workflow variants depending on whether your cluster ingress is reachable from the public internet.

| Variant | File | Runner | When to use |
|---|---|---|---|
| **Public cluster** | `docs/workflows/idig_publish_public.yml` | `ubuntu-latest` | Cluster ingress is publicly reachable from the internet |
| **Private cluster** | `docs/workflows/idig_publish_private.yml` | `self-hosted` | Cluster is on a private network or behind a VPN |

Copy the relevant file to `.github/workflows/idig_publish.yml` and fill in the two environment variables at the top:

```yaml
env:
  IDIG_BROKER_HOST: <your-cluster-domain>        # e.g. apps.my-cluster.example.com
  PLATFORM_IDIG_PREFIX: idig
```

The full broker URL is constructed as `https://<PLATFORM_IDIG_PREFIX>.<IDIG_BROKER_HOST>`, for example `https://idig.apps.my-cluster.example.com`.

---

## 4. Set up a self-hosted runner (private cluster only)

Skip this section if you are using the public cluster variant.

OCP's restricted security policy prevents installing packages at pod runtime — if you are on a vanilla Kubernetes cluster, follow the Vanilla Kubernetes section of [`docs/runner/RUNNER_SETUP.md`](runner/RUNNER_SETUP.md) instead. The steps below are for OCP. Full instructions are in [`docs/runner/RUNNER_SETUP.md`](runner/RUNNER_SETUP.md).

### Step 1 - Get a runner registration token

Go to your repository → **Settings → Actions → Runners → New self-hosted runner**. Select **Linux / x64**. GitHub shows a `config.sh` command - copy the token value from the `--token` argument.

> The token is single-use and expires after 1 hour. Generate it immediately before deploying.

### Step 2 - Create an ImageStream

```bash
oc create imagestream github-runner -n <namespace>
```

### Step 3 - Build the runner image

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

Wait for `Push successful` before continuing.

### Step 4 - Store the registration token

```bash
oc create secret generic github-runner-secret \
  --from-literal=token=<paste-token-here> \
  --from-literal=url=https://github.com/<your-org>/<your-repo> \
  -n <namespace>
```

### Step 5 - Deploy the runner

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

### Step 6 - Verify the runner is online

```bash
oc logs -f deployment/github-runner -n <namespace>
```

Wait for `Listening for Jobs`. The runner will appear as **Idle** under **Settings → Actions → Runners** in GitHub.

> The registration token is single-use. If the runner pod restarts you will need a new token - see [`docs/runner/RUNNER_SETUP.md`](runner/RUNNER_SETUP.md) for the update procedure.

---

## 5. Structure your repository

The workflow detects changes at the **folder level** - all files inside a changed folder are zipped and published together. Each top-level folder in the repository is treated as a separate IDIG project.

```
my-repo/
├── .github/
│   └── workflows/
│       └── idig_publish.yml
├── project-a/
│   ├── mcp-server.yaml
│   └── mcp-invoke.yaml
└── project-b/
    └── llm.yaml
```

Asset files must be valid IDIG YAML with `kind`, `metadata.name`, `metadata.namespace`, and `metadata.version` fields. Only `MCPServer` and `LLM` kinds are processed for deletion when files are removed - other kinds are published but not automatically deleted.

---

## 6. Trigger a publish

Push a change to any file inside a project folder:

```bash
git add project-a/mcp-server.yaml
git commit -m "update mcp server"
git push origin main
```

The workflow will:

1. Detect that `project-a/mcp-server.yaml` changed
2. Zip the entire `project-a/` folder
3. Obtain a short-lived JWT from `/api/v1/federated-login`
4. POST the zip to `/idig-broker/publish`
5. Report the broker response in the job log

A successful publish returns `total_results` in the response. Assets will appear in the IDIG UI shortly after.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Failed to obtain access token` | Credentials wrong or login endpoint unreachable | Verify `IDIG_USERNAME` / `IDIG_PASSWORD` secrets are set correctly; check the broker route is reachable from the runner |
| `total_results: 0` | No project folders in the changed files | The push only changed files outside a project folder (e.g. the workflow file itself) - push a change inside a project folder |
| `field not declared in schema` | Stale CRs from an older CRD version exist in the cluster | Remove old CRs or redeploy IDIG with a version whose CRD schema matches |
| Runner `CrashLoopBackOff` | Pod filesystem permissions issue or registration token expired | Check pod logs; if the token expired generate a new one and update `github-runner-secret` |
| Jobs queued but never picked up | Runner is offline or not registered | Check runner status under **Settings → Actions → Runners**; verify the pod is running and logs show `Listening for Jobs` |
