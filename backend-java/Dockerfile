# Stage 1 — build
FROM maven:3.9-eclipse-temurin-21-alpine AS builder
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -q
COPY src ./src
RUN mvn package -DskipTests -q

# Stage 2 — runtime
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=builder /app/target/*.jar app.jar
USER appuser

# Perfil de produção (application-prod.yml): inicialização preguiçosa, sem DEBUG, sem Swagger.
ENV SPRING_PROFILES_ACTIVE=prod

# Render free: 512 MB e CPU compartilhada.
#  -Xmx350m                       heap limitado; sobra ~160 MB para metaspace, threads e memória nativa
#  -XX:+UseSerialGC               GC de uma thread: menos memória e sem threads extras disputando a CPU
#  -XX:TieredStopAtLevel=1        só o compilador C1: sobe mais rápido e gasta menos CPU na partida
#  -XX:+UseStringDeduplication    economiza heap com Strings repetidas (Serial GC suporta desde o JDK 18)
#  -Xss512k                       pilha menor por thread (o padrão é 1 MB)
ENV JAVA_TOOL_OPTIONS="-Xmx350m -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -XX:+UseStringDeduplication -Xss512k"

EXPOSE 3333
# Health check público e sem autenticação: GET /actuator/health (configure este caminho no Render)
ENTRYPOINT ["java", "-jar", "app.jar"]
