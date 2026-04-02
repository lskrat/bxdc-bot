# 基础镜像（稳定版）
FROM ubuntu:22.04
WORKDIR /app

# 禁止交互
ENV DEBIAN_FRONTEND=noninteractive

# 1. 安装 JDK21
RUN apt-get update && apt-get install -y openjdk-21-jre && rm -rf /var/lib/apt/lists/*

RUN apt-get update && apt-get install -y maven && rm -rf /var/lib/apt/lists/*

# 2. 安装 Node.js 24
RUN apt-get update && apt-get install -y vim curl gnupg && \
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /usr/share/keyrings/nodesource.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list && \
    apt-get update && apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# 3、安装 Nginx
RUN apt-get update && apt-get install -y nginx && rm -rf /var/lib/apt/lists/*

# 4. 复制全部项目到镜像（包含前端+后端）
COPY . /app

# agent-core
WORKDIR /app/backend/agent-core
RUN npm install --legacy-peer-deps && npm run build

# skill-gateway
WORKDIR /app/backend/skill-gateway
RUN mvn clean package -DskipTests

# frontend
WORKDIR /app/frontend
RUN npm install --legacy-peer-deps && npm run build

# 5、替换 Nginx 配置
RUN rm -f /etc/nginx/nginx.conf && cp /app/nginx.conf /etc/nginx/nginx.conf

# 6. 暴露 18080 3000 80 端口
EXPOSE 18080 3000 80

# 保持容器运行
CMD ["tail", "-f", "/dev/null"]

#RUN chmod +x /app/start.sh
#CMD ["/app/start.sh"]