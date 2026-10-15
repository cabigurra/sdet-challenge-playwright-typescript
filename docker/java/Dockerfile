# syntax=docker/dockerfile:1

FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY pom.xml .
RUN mvn -q -B -ntp dependency:go-offline
COPY src ./src
RUN mvn -q -B -ntp package -DskipTests

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /build/target/sdet-challenge-api-*.jar app.jar

ENV PORT=3000
EXPOSE 3000
ENTRYPOINT ["java", "-jar", "app.jar"]
