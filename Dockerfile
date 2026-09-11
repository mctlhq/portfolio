FROM node:24-alpine@sha256:50c8e8ca1d27439048670df5883f32d57cf81cff6233222c893fd0d9884cbd81 AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && node scripts/check-dist.mjs && node scripts/csp-hash.mjs > /app/csp-script-src.txt

FROM nginx:1.30-alpine@sha256:dc5069ad14f19660b141b21236140b91656bf89bbc3e2417c70ae650cd66104c
COPY nginx.conf /tmp/nginx.conf
COPY --from=builder /app/csp-script-src.txt /tmp/csp-script-src.txt
RUN HASHES="$(cat /tmp/csp-script-src.txt)" \
 && sed "s|__SCRIPT_SRC_HASHES__|${HASHES}|g" /tmp/nginx.conf > /etc/nginx/conf.d/default.conf \
 && grep -q "sha256-" /etc/nginx/conf.d/default.conf \
 && ! grep -q "__SCRIPT_SRC_HASHES__" /etc/nginx/conf.d/default.conf \
 && rm /tmp/nginx.conf /tmp/csp-script-src.txt
COPY --from=builder /app/dist/ /usr/share/nginx/html/
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q --spider http://127.0.0.1/healthz || exit 1
CMD ["nginx", "-g", "daemon off;"]
