# The roofing CRM (pages and API) as one Lambda container image.
# Build stage: install and build on Linux.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-slim
# Lambda Web Adapter: lets an ordinary HTTP server (Next.js here) run on Lambda unchanged.
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter
WORKDIR /app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=8080 \
    AWS_LWA_PORT=8080 AWS_LWA_READINESS_CHECK_PATH=/api/health
EXPOSE 8080
CMD ["node", "server.js"]
