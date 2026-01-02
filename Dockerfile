# default image for node
FROM node:18-alpine
# set workdir
WORKDIR /app
# set libraries
COPY ./package*.json ./
# install everything
RUN npm install
# include the project files
COPY ./index.js . 
COPY ./src ./src
COPY ./docs ./docs
# run the app
CMD ["node", "index.js"]