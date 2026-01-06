import * as actualApi from '@actual-app/api'
import ical, { ICalCalendarMethod } from 'ical-generator'
import { RRule } from 'rrule'
import { DateTime } from 'luxon'
import { RecurConfig, ScheduleEntity } from '@actual-app/api/@types/loot-core/src/types/models'
import { formatCurrency } from './helpers/number'
import { existsSync, mkdirSync } from 'node:fs'
import logger from './helpers/logger'

const {
  ACTUAL_SERVER,
  ACTUAL_MAIN_PASSWORD,
  ACTUAL_SYNC_ID,
  ACTUAL_SYNC_PASSWORD,
  ACTUAL_PATH = '.actual-cache',
  TZ = 'UTC',
  FORECAST_MONTHS = '3',
} = process.env

if (!ACTUAL_SERVER || !ACTUAL_MAIN_PASSWORD || !ACTUAL_SYNC_ID) {
  throw new Error('Missing ACTUAL_SERVER, ACTUAL_MAIN_PASSWORD or ACTUAL_SYNC_ID')
}

// Handle unhandled exceptions from Actual SDK
process.on('uncaughtException', (error) => {
  logger.error('Unhandled exception', error)
})

const getSchedules = async () => {
  if (!existsSync(ACTUAL_PATH)) {
    logger.debug('Creating directory:', ACTUAL_PATH)
    mkdirSync(ACTUAL_PATH)
  }

  await actualApi.init({
    dataDir: ACTUAL_PATH,
    serverURL: ACTUAL_SERVER,
    password: ACTUAL_MAIN_PASSWORD,
    verbose: false,
  })

  await actualApi.downloadBudget(ACTUAL_SYNC_ID, {
    password: ACTUAL_SYNC_PASSWORD,
  })

  const query = actualApi.q('schedules')
    .filter({
      completed: false,
      tombstone: false,
    })
    .select(['*'])

  // @ts-expect-error - Actual SDK types can be finicky
  const { data } = await actualApi.aqlQuery(query) as { data: ScheduleEntity[] }

  return data
}

const resolveFrequency = (frequency: string) => {
  switch (frequency) {
    case 'yearly': return RRule.YEARLY
    case 'monthly': return RRule.MONTHLY
    case 'weekly': return RRule.WEEKLY
    case 'daily': return RRule.DAILY
    default: throw new Error(`Invalid frequency: ${frequency}`)
  }
}

const formatAmount = (schedule: ScheduleEntity) => {
  const amount = schedule._amount
  if (typeof amount === 'number') {
    return formatCurrency(amount)
  }
  return `${formatCurrency(amount.num1)} ~ ${formatCurrency(amount.num2)}`
}

const moveOnWeekend = (date: Date, recurringData: RecurConfig) => {
  const dateTime = DateTime.fromJSDate(date)

  if (!recurringData.skipWeekend || (dateTime.weekday !== 6 && dateTime.weekday !== 7)) {
    return dateTime
  }

  if (recurringData.weekendSolveMode === 'after') {
    const daysToMove = dateTime.weekday === 6 ? 2 : 1
    return dateTime.plus({ days: daysToMove })
  }

  if (recurringData.weekendSolveMode === 'before') {
    const daysToMove = dateTime.weekday === 6 ? -1 : -2
    return dateTime.plus({ days: daysToMove })
  }

  return dateTime
}

export const generateIcal = async () => {
  const schedules = await getSchedules()
  const today = DateTime.now()
  const forecastUntil = today.plus({ months: parseInt(FORECAST_MONTHS) }).toJSDate()

  logger.debug(`Found ${schedules.length} schedules`)

  const calendar = ical({
    name: 'Actual Balance iCal',
  })

  calendar.method(ICalCalendarMethod.REQUEST)

  schedules.forEach((schedule) => {
    logger.debug(schedule, 'Processing Schedule')
    const recurringData = schedule._date
    const nextDate = DateTime.fromISO(schedule.next_date)

    if (typeof recurringData === 'string' || !recurringData.frequency) {
      // Single event logic
      calendar.createEvent({
        start: nextDate.toJSDate(),
        summary: `${schedule.name} (${formatAmount(schedule)})`,
        allDay: true,
        timezone: TZ,
      })
      return
    }

    const getEndDate = () => {
      if (recurringData.endMode === 'never') return forecastUntil
      if (recurringData.endMode === 'after_n_occurrences') return undefined
      if (!recurringData.endDate) return undefined
      return DateTime.fromISO(recurringData.endDate).toJSDate()
    }

    const getCount = () => {
      if (recurringData.endMode === 'after_n_occurrences') return recurringData.endOccurrences
      return undefined
    }

    const ruleOptions = {
      freq: resolveFrequency(recurringData.frequency),
      dtstart: DateTime.fromISO(recurringData.start).toJSDate(),
      until: getEndDate(),
      count: getCount(),
      interval: (recurringData as any).interval || 1, // Cast to any because the type might miss interval
      tzid: TZ,
    }

    try {
      const rule = new RRule(ruleOptions)
      rule.all().forEach((date) => {
        const eventDate = DateTime.fromJSDate(date)
        if (eventDate >= nextDate) {
          calendar.createEvent({
            start: moveOnWeekend(date, recurringData).toJSDate(),
            summary: `${schedule.name} (${formatAmount(schedule)})`,
            allDay: true,
            timezone: TZ,
          })
        }
      })
    } catch (e) {
      logger.error(`Error processing schedule ${schedule.name}:`, e)
    }
  })

  return calendar.toString()
}
