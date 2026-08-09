# MPXJ needs a real JRE: jdk.charsets (MacRoman, for .mpp) and a headless
# java.desktop (java.awt.Color, touched while parsing Gantt view data). Trimmed
# runtimes such as jdk4py, and GraalVM native images, fail on both counts.
FROM eclipse-temurin:21-jre-noble

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    MPP_JAVA_HOME=/opt/java/openjdk \
    PORT=8080

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-pip python3-venv \
 && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY converter.py app.py ./

RUN useradd --create-home --uid 10001 convert
USER convert

EXPOSE 8080

# Shell form on purpose: $PORT is injected by the host (Render, Cloud Run, Fly) and has
# to expand at start-up.
#
# One worker, two threads: each worker boots its own JVM, and conversion is CPU-bound
# inside Java. Scale with replicas, not workers.
CMD gunicorn --bind "0.0.0.0:${PORT:-8080}" --workers 1 --threads 2 \
    --timeout 120 --preload app:app
