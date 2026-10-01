# Clocker.cc

A lightweight (actually) serverless time clock app

## Usage

https://clocker.cc

## Run

Simply serve the static assets in the [public](./public/) directory. There is no
build step and no dependencies. On a Mac, you can do this with the built in
Python 3:

```bash
python3 -m http.server -d public 7107
```

## Test

Running the tests in the [tests](./tests/) directory requires
[Node](https://nodejs.org/en/download).

```bash
node --test
```
