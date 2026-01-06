# actual-ical

A simple application to expose [Actual](https://github.com/actualbudget/actual) Scheduled Transactions in iCal format.

<p align="center">
  <img src="_images/homepage_example.png" />
</p>

## Features

- Currency display
- Respect schedule weekend configuration
- Realtime updates
- Random URL to make it harder to guess (using the Sync ID)

## Usage

Just run the docker image

```bash
docker volume create actual-ical

docker run -d -p 3000:3000 \
  -v actual-ical:/app/.actual-cache \
  -e ACTUAL_SERVER=http://actual.example.com \
  -e ACTUAL_MAIN_PASSWORD=mainpassword \
  -e ACTUAL_SYNC_ID=syncid \
  ghcr.io/matheusvellone/actual-ical
```

Or with docker-compose

```yaml
services:
  actual-ical:
    image: ghcr.io/matheusvellone/actual-ical
    ports:
      - 3000:3000
    environment:
      ACTUAL_SERVER: http://actual.example.com
      ACTUAL_MAIN_PASSWORD: mainpassword
      ACTUAL_SYNC_ID: syncid
    volumes:
      - actual-ical:/app/.actual-cache

volumes:
  actual-ical:
```

Then you can access the iCal feed at `http://localhost:3000/actual.ics`

> If `SYNC_ID_AS_URL` is set to `true`, the URL will be `http://localhost:3000/{ACTUAL_SYNC_ID}.ics`

## Configuration

All configuration is done through environment variables.

|Name|Description|Required|Default|
|---|---|---|---|
|ACTUAL_SERVER|The server to use when connecting to the Actual API|true||
|ACTUAL_MAIN_PASSWORD|The password to use when connecting to the Actual API|true||
|ACTUAL_SYNC_ID|The sync ID to use when connecting to the Actual API. Find this ID in Settings > Advanced Settings > Sync ID|true||
|SYNC_ID_AS_URL|Set to `true` to use the sync ID as part of the URL to make it safer to expose publicly, just like Google Calendar does|false||
|ACTUAL_SYNC_PASSWORD|The sync password|false||
|ACTUAL_PATH|The path to store Actual cache data. The container must have write access to this path.|false|`.actual-cache`|
|TZ|The timezone to use on ical data|false|UTC|
|PORT|The port to listen on|false|3000|
|LOCALE|The locale to use when formatting amounts|false|en-US|
|CURRENCY|The currency to use when formatting amounts. Values must be one of [these](https://en.wikipedia.org/wiki/ISO_4217#List_of_ISO_4217_currency_codes)|false|USD|
|LOG_LEVEL|The log level to use. `trace`, `debug`, `info`, `warn`, `error` or `fatal`|false|`info`|
|FORECAST_MONTHS| (defaulting to 3). This allows the code to calculate an until date for "never" schedules rather than guessing a count.

## Hosting it publicly

If you want to host this application publicly, you should use `SYNC_ID_AS_URL` to make the URL random and harder to guess.
