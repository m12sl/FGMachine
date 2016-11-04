FROM node
MAINTAINER Alex Ozerin <m12sl@yandex.ru>

# Install nodejs
RUN apt-get update \
    && apt-get install -y \
    	vim \
	curl \
	lxc \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Clone FGMachine repo for RAM example
RUN cd /root \
    && git clone https://github.com/m12sl/FGMachine.git \
    && cd FGMachine \
    && npm install --unsafe-perm

# Install sk learn

# For ssl key 
ENV SSL_KEY=/root/key.pem \
    SSL_CERT=/root/cert.pem

RUN cd /root \
    && openssl req -x509 -newkey rsa:4096 -keyout $SSL_KEY -out $SSL_CERT -days 7 -nodes -subj '/CN=localhost'

# Expose port
EXPOSE 443
EXPOSE 8080
#EXPOSE 5081

# Set working directory
WORKDIR /root/FGMachine
# Start server
ENTRYPOINT ["node", "machine"]
