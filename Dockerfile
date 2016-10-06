# Start with Keras base image
FROM kaixhin/keras
MAINTAINER Kai Arulkumaran <design@kaixhin.com>

# Install sk learn
RUN pip install -U scikit-learn

# Install vim && curl
RUN apt-get install -y vim
RUN apt-get install -y curl

RUN curl -sL https://deb.nodesource.com/setup_6.x | sudo -E bash -
RUN apt-get install -y nodejs

# Clone FGMachine repo for RAM example

RUN cd /root && git clone https://github.com/Kaixhin/FGMachine.git && cd FGMachine && \
# npm install
  npm install

# Install lxc for creating sibling containers with docker
RUN apt-get update && apt-get install -y lxc

# Expose port
EXPOSE 80
EXPOSE 8080
EXPOSE 5080
EXPOSE 5081
EXPOSE 5082

# Set working directory
WORKDIR /root/FGMachine
# Start server
ENTRYPOINT ["node", "machine"]
