SHELL=/bin/bash
.PHONY: watch lint clean install

APP_NAME?=$(shell basename `pwd`)
watch:
	DEBUG=true ./node_modules/.bin/supervisor --watch 'src/,./' --ignore "./test"  -e "litcoffee,coffee,js" --exec make run-server

lint:
	find ./src -name '*.coffee' | xargs ./node_modules/.bin/coffeelint -f ./etc/coffeelint.conf
	find ./src -name '*.js' | xargs ./node_modules/.bin/jshint 

install: node_modules/

node_modules/:
	npm install .

build_output/: node_modules/
	mkdir -p build_output

run-server: build_output/
	exec bash -c "export APP_NAME=${APP_NAME}; test -r ~/.${APP_NAME}.env && . ~/.${APP_NAME}.env ; exec node server.js"

clean:
	rm -rf ./node_modules/
