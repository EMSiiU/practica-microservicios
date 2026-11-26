FROM maven:3.9-eclipse-temurin-21 AS compilacion
WORKDIR /app
COPY pom.xml ./
COPY src/ ./src/
RUN mvn --batch-mode --no-transfer-progress package

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=compilacion /app/target/api-pagos.jar ./api-pagos.jar
USER 10001
EXPOSE 8007
ENTRYPOINT ["java", "-jar", "/app/api-pagos.jar"]
