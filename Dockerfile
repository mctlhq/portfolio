FROM node:26-alpine@sha256:ef24c5053d50fdc3e4e56eb4e7ddb7861874ab0fdc797046ba897581deb8e868 AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && node scripts/check-dist.mjs && node scripts/csp-hash.mjs > /app/csp-script-src.txt

FROM nginx:1.30-alpine@sha256:dc5069ad14f19660b141b21236140b91656bf89bbc3e2417c70ae650cd66104c
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /tmp/security-headers.conf
COPY --from=builder /app/csp-script-src.txt /tmp/csp-script-src.txt
RUN HASHES="$(cat /tmp/csp-script-src.txt)" \
 && sed "s|__SCRIPT_SRC_HASHES__|${HASHES}|g" /tmp/security-headers.conf > /etc/nginx/security-headers.conf \
 && grep -qE "script-src 'self' 'sha(256|384|512)-[A-Za-z0-9+/]+={0,2}'" /etc/nginx/security-headers.conf \
 && ! grep -qE "(^|[^'])sha(256|384|512)-" /etc/nginx/security-headers.conf \
 && ! grep -q "__SCRIPT_SRC_HASHES__" /etc/nginx/security-headers.conf \
 && rm /tmp/security-headers.conf /tmp/csp-script-src.txt
COPY --from=builder /app/dist/ /usr/share/nginx/html/
RUN nginx -t
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q --spider http://127.0.0.1/healthz || exit 1
CMD ["nginx", "-g", "daemon off;"]
