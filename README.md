# Clocker.cc

A lightweight (actually) serverless time clock app

## Usage

The basic proof of concept is available online.

https://clocker.cc

Clock in and clock out. The times are displayed in a standard ISO date string.
Importantly, the data is all stored within the URL. This allows you to transfer
your data from one device to another simply by copying and pasting the web
address. There is no server looking at your data.

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
