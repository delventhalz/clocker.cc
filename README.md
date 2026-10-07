# Clocker.cc

A lightweight (actually) serverless time clock app

## Usage

The basic proof of concept is available online.

https://clocker.cc

Clock in and clock out. Times are displayed in a list below. Importantly,
the data is all stored within the URL. This allows you to transfer your data
from one device to another simply by copying and pasting the web address.
There is no server.

## Run

To run locally, simply serve the static assets in the [public](./public/)
directory. There is no build step and no dependencies. On a Mac, you can do this
with Python 3:

```bash
python3 -m http.server -d public 7107
```

## Test

Running the tests in the [tests](./tests/) directory requires
[Node](https://nodejs.org/en/download), and uses Node's built in
[test runner](https://nodejs.org/api/test.html).

```bash
node --test
```
