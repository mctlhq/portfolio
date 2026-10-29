FROM node:25-alpine@sha256:bdf2cca6fe3dabd014ea60163eca3f0f7015fbd5c7ee1b0e9ccb4ced6eb02ef4 AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && node scripts/check-dist.mjs && node scripts/csp-hash.mjs > /app/csp-script-src.txt
RUN HASHES="$(cat /app/csp-script-src.txt)" \
 && sed "s|__SCRIPT_SRC_HASHES__|${HASHES}|g" security-headers.conf > security-headers.rendered.conf \
 && grep -qE "script-src 'self' 'sha(256|384|512)-[A-Za-z0-9+/]+={0,2}'" security-headers.rendered.conf \
 && ! grep -qE "(^|[^'])sha(256|384|512)-" security-headers.rendered.conf \
 && ! grep -q "__SCRIPT_SRC_HASHES__" security-headers.rendered.conf

# nginx-unprivileged runs as uid 101 and keeps its pid and temp files under
# /tmp, so the container needs no capabilities and works with a read-only
# root filesystem (base-service step-2 defaults). The numeric USER lets the
# kubelet verify runAsNonRoot. The CSP substitution happens in the builder
# stage so this stage needs no file writes as root.
FROM nginxinc/nginx-unprivileged:1.31-alpine@sha256:b5047b9b76845eac124358373c6852377c52e4b05834a47647e955dd91cb8f1e
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/security-headers.rendered.conf /etc/nginx/security-headers.conf
COPY --from=builder /app/dist/ /usr/share/nginx/html/
USER 101:101
# The config test writes nginx.pid and temp directories into /tmp; clear them
# so the image ships an empty /tmp. A root-owned leftover there crash-looped
# 0.1.45 on a pod without a /tmp emptyDir.
RUN nginx -t && rm -rf /tmp/*
# Port contract: mctl-gitops labs/portfolio sets service.containerPort: 8080
# (mctlhq/mctl-gitops#1943); keep the two in step.
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q --spider http://127.0.0.1:8080/healthz || exit 1
CMD ["nginx", "-g", "daemon off;"]
