# ShopFlow

A production-pattern microservices e-commerce backend built to practice a full DevOps toolchain end to end.

**Tools covered:** Docker · Docker Compose · Kubernetes · Ansible · Jenkins · GitHub Actions

---

## Project Overview

ShopFlow consists of three Node.js microservices — Auth, Products, and Orders — each with its own Postgres database. The services communicate over HTTP inside a Kubernetes cluster, secured with RBAC, NetworkPolicies, and Pod Security Contexts. Every code push automatically triggers a CI/CD pipeline that tests, builds, pushes, and deploys the updated services to the cluster.

### System Design

/home/salma/Downloads/shopflow_system_design.svg

> The diagram above shows the full pipeline: developer push → GitHub Actions → Jenkins (build/push/deploy) → Ansible SSH → kubectl → K8s cluster (Ingress → services → DBs) with Docker Hub as the image registry.

### Architecture

```
Outside world
      ↓
Ingress (nginx) — shopflow.local
      ↓
┌─────────────────────────────────────────────┐
│  shopflow-dev namespace                     │
│                                             │
│  auth-service ──────────► auth-db           │
│  products-service ───────► products-db      │
│  orders-service ─────────► orders-db        │
│       │                                     │
│       └──────► products-service             │
└─────────────────────────────────────────────┘
```

Each service owns its own database — services never share a DB or call each other's DB directly.

---

## Services

| Service | Port | Responsibility |
|---|---|---|
| auth-service | 3001 | Register, login, issue and verify JWTs |
| products-service | 3002 | Product catalog and stock management |
| orders-service | 3003 | Create orders, calls products-service internally |

---

## Project Structure

```
shopflow/
├── auth-service/
│   ├── src/
│   │   ├── app.js                   # Express app (exported for tests)
│   │   ├── index.js                 # Server entry point
│   │   ├── routes/auth.js           # Register, login, verify routes
│   │   ├── middleware/verifyToken.js
│   │   └── tests/health.test.js
│   ├── Dockerfile
│   └── package.json
├── products-service/                # Same structure
├── orders-service/                  # Same structure
├── docker-compose.yml               # Local development environment
├── Jenkinsfile                      # Jenkins pipeline definition
├── ansible/
│   ├── site.yml                     # Full provisioning playbook (fresh machine)
│   ├── deploy.yml                   # Deploy-only playbook (used by Jenkins)
│   ├── inventory/hosts.ini          # Target machines
│   ├── group_vars/all.yml           # Shared variables
│   └── roles/
│       ├── common/                  # Base system setup (swap, kernel params)
│       ├── docker/                  # Docker Engine installation
│       ├── minikube/                # Minikube + kubectl setup
│       └── shopflow/                # App deployment tasks
├── k8s/
│   ├── namespaces/                  # shopflow-dev, shopflow-prod
│   ├── rbac/                        # ServiceAccounts per service
│   ├── storage/                     # PersistentVolumes and PVCs
│   ├── databases/                   # Postgres Deployments and Services
│   ├── services/                    # App Deployments and Services
│   ├── network-policies/            # Pod-to-pod traffic rules
│   └── ingress/                     # Nginx Ingress routing
└── .github/
    └── workflows/
        └── ci.yml                   # GitHub Actions workflow
```

---

## Prerequisites

### To run locally (Docker Compose only)
- Docker and Docker Compose

### To deploy to K8s manually
- A running K8s cluster (kubeadm or Minikube)
- kubectl configured with kubeconfig
- A Docker Hub account
- Images built and pushed

### To provision a fresh machine (site.yml)
- Ansible installed on your control machine
- SSH access to the target machine
- The playbook installs everything else automatically (Docker, kubectl, Minikube)

### For the full CI/CD pipeline
- All of the above
- Jenkins running (as a container or installed)
- A public URL for Jenkins (Cloudflare tunnel or similar)
- GitHub Secrets configured (see CI/CD Pipeline section)

---

## Run Locally with Docker Compose

Docker Compose is the local development environment. Each service has its own isolated Postgres container and they communicate over Docker's internal DNS — mirroring the K8s setup.

```bash
# Clone the repo
git clone https://github.com/Salma-Hossam1/shopflow.git
cd shopflow

# Generate package-lock.json files (first time only)
cd auth-service && npm install && cd ..
cd products-service && npm install && cd ..
cd orders-service && npm install && cd ..

# Start everything
docker compose up --build
```

Test the full flow:

```bash
# Register a user
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"password123"}'

# Login and get a token
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"password123"}'

# List products (no auth required)
curl http://localhost:3002/api/products

# Create an order (use token from login)
curl -X POST http://localhost:3003/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{"product_id":1,"quantity":2}'
```

---

## Deploy to Kubernetes

### 1. Create the namespace

```bash
kubectl apply -f k8s/namespaces/
```

### 2. Label the storage node

```bash
kubectl label node <your-node> shopflow/role=storage
```

This label is used by PersistentVolumes and Deployments to pin storage to a specific node. Replace `<your-node>` with the actual node name shown by `kubectl get nodes`.

### 3. Create secrets

```bash
kubectl create secret generic jwt-secret \
  --from-literal=JWT_SECRET=your_jwt_secret \
  --namespace=shopflow-dev

kubectl create secret generic auth-db-secret \
  --from-literal=POSTGRES_PASSWORD=authpassword \
  --from-literal=POSTGRES_USER=authuser \
  --from-literal=POSTGRES_DB=authdb \
  --namespace=shopflow-dev

kubectl create secret generic products-db-secret \
  --from-literal=POSTGRES_PASSWORD=productspassword \
  --from-literal=POSTGRES_USER=productsuser \
  --from-literal=POSTGRES_DB=productsdb \
  --namespace=shopflow-dev

kubectl create secret generic orders-db-secret \
  --from-literal=POSTGRES_PASSWORD=orderspassword \
  --from-literal=POSTGRES_USER=ordersuser \
  --from-literal=POSTGRES_DB=ordersdb \
  --namespace=shopflow-dev
```

### 4. Apply manifests in order

```bash
kubectl apply -f k8s/rbac/ -n shopflow-dev
kubectl apply -f k8s/storage/ -n shopflow-dev
kubectl apply -f k8s/databases/ -n shopflow-dev
kubectl apply -f k8s/services/ -n shopflow-dev
kubectl apply -f k8s/network-policies/ -n shopflow-dev
kubectl apply -f k8s/ingress/ -n shopflow-dev
```

Order matters — RBAC must exist before Deployments reference ServiceAccounts, and databases must be running before services start.

### 5. Add to /etc/hosts

```bash
# Get your node IP
kubectl get nodes -o wide

echo "<node-ip> shopflow.local" | sudo tee -a /etc/hosts
```

### 6. Get the ingress NodePort and test

```bash
kubectl get svc -n ingress-nginx

# Use the NodePort shown for port 80
curl http://shopflow.local:<nodeport>/api/auth/health
curl http://shopflow.local:<nodeport>/api/products/health
curl http://shopflow.local:<nodeport>/api/orders/health
```

---

## Ansible Playbooks

Two playbooks serve different purposes:

**`site.yml` — full provisioning**
Run once on a fresh machine. Installs Docker, kubectl, and Minikube, starts the cluster, creates namespaces, and deploys the app.

```bash
cd ansible
ansible-playbook site.yml --ask-become-pass
```

**`deploy.yml` — deploy only**
Run on every code change. Assumes the machine is already provisioned. Skips all installation steps and only updates the running application. This is what Jenkins calls automatically.

```bash
cd ansible
ansible-playbook deploy.yml \
  --extra-vars "shopflow_image_tag=abc1234 docker_hub_username=yourusername"
```

---

## CI/CD Pipeline

Every push to `master` that touches service code, K8s manifests, Ansible files, or the Jenkinsfile triggers the full pipeline automatically.

### Flow

```
Push to GitHub (master)
        ↓
GitHub Actions
  ├── npm test — auth-service
  ├── npm test — products-service
  ├── npm test — orders-service
  └── if all pass → trigger Jenkins via API call
        ↓
Jenkins
  ├── Checkout   clone repo into workspace
  ├── Build      docker build × 3, tagged with git commit SHA
  ├── Push       docker push to Docker Hub
  └── Deploy     ansible-playbook deploy.yml
                   ├── SSH to target machine
                   ├── git pull latest repo
                   ├── kubectl apply updated service manifests
                   │     envsubst replaces $IMAGE_TAG and $DOCKER_USER
                   └── kubectl rollout status (wait for completion)
        ↓
K8s cluster
  ├── pulls new images from Docker Hub
  └── rolling update — new pod starts before old pod terminates
```

### Image tagging

Images are tagged with the first 7 characters of the git commit SHA:

```
yourusername/shopflow-auth-service:2c9b296
yourusername/shopflow-products-service:2c9b296
yourusername/shopflow-orders-service:2c9b296
```

This makes every build unique and enables rollback — re-run the pipeline with an older commit SHA to redeploy a previous version.

### Jenkins credentials required

| ID | Type | Purpose |
|---|---|---|
| `docker-hub-credentials` | Username/Password | Push images to Docker Hub |
| `kubeconfig` | Secret file | Authenticate with K8s API server |

### GitHub Secrets required

| Name | Purpose |
|---|---|
| `JENKINS_URL` | Public URL of Jenkins (e.g. Cloudflare tunnel) |
| `JENKINS_USER` | Jenkins username |
| `JENKINS_TOKEN` | Jenkins API token |
| `JENKINS_BUILD_TOKEN` | Build trigger token set in Jenkins job config |

### Jenkins SSH setup

Jenkins SSHs into the target machine to run Ansible and kubectl. The Jenkins container needs an SSH key pair with the public key added to the target machine:

```bash
# Generate SSH key inside Jenkins container
docker exec -u jenkins jenkins ssh-keygen -t rsa -b 4096 \
  -f /var/jenkins_home/.ssh/id_rsa -N ""

# View the public key and add it to target machine
docker exec jenkins cat /var/jenkins_home/.ssh/id_rsa.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# Test the connection
docker exec jenkins ssh -i /var/jenkins_home/.ssh/id_rsa \
  -o StrictHostKeyChecking=no user@<target-ip> "kubectl get nodes"
```

---

## Security

| Layer | Implementation |
|---|---|
| Identity | ServiceAccount per service — no shared default SA |
| Pod security | `runAsNonRoot`, `readOnlyRootFilesystem`, drop ALL capabilities |
| Filesystem | `emptyDir` volume mounted at `/tmp` for Node.js temp files |
| Network | NetworkPolicies restrict which pod can reach which |
| Secrets | DB passwords and JWT secret injected via K8s Secrets, never in Git |
| Images | Non-root user created in Dockerfile, pinned base image versions |

### NetworkPolicy rules

```
auth-db          → only accepts traffic from: auth-service
products-db      → only accepts traffic from: products-service
orders-db        → only accepts traffic from: orders-service
products-service → only accepts traffic from: ingress-controller, orders-service
auth-service     → only accepts traffic from: ingress-controller
orders-service   → only accepts traffic from: ingress-controller
```

---

## Key Design Decisions

**Why does each service have its own database?**
Microservices data isolation — schema changes in one service cannot break another. Services own their data and expose it only through their API.

**Why JWT and not sessions?**
JWTs are stateless. Any service can verify a token locally using the shared secret without calling auth-service on every request, avoiding a network hop on every protected endpoint.

**Why Ansible instead of kubectl directly in Jenkins?**
Ansible provides ordered deployment, idempotency, and rollout waiting in a reusable playbook. It also runs kubectl on the target machine which already has kubeconfig, rather than requiring kubectl inside Jenkins.

**Why envsubst for image tags?**
Service manifests in Git use `$IMAGE_TAG` and `$DOCKER_USER` as placeholders. At deploy time Ansible sets these environment variables and envsubst substitutes them before applying — keeping manifests generic in Git while deploying exact commit-tagged images in production.

**Why SSH from Jenkins to your machine instead of running kubectl inside Jenkins?**
Your machine already has kubectl, kubeconfig, and is part of the cluster. Installing kubectl inside a Jenkins container resets on every container restart. SSHing to the target machine is more stable and follows the principle that Ansible manages remote machines, not the machine it runs on.