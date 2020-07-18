From python:3.7-alpine
MAINTAINER situn panda
USER root
WORKDIR /usr/src/tmp
COPY . .
ENTRYPOINT [ "python", "./duFind.py", "." ]