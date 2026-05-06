# SRE Copilot V2 Tooling Image
# 用途：打包当前 V2 runtime / eval 工具链，不提供 HTTP 服务。

FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY AGENTS.MD CHANGELOG.MD DEPLOYMENT-GUIDE.MD LOCAL-DEV-GUIDE.MD README.MD TODO.MD ./
COPY docs/ docs/
COPY eval/ eval/
COPY knowledge/ knowledge/
COPY scripts/ scripts/
COPY v2/ v2/

CMD ["npm", "run", "workflow:handoff"]
