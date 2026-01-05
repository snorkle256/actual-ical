import * as actualApi from '@actual-app/api'
import ical, { ICalCalendarMethod } from 'ical-generator'
import { RRule } from 'rrule'
import { DateTime, DurationLikeObject } from 'luxon'
import { RecurConfig, ScheduleEntity } from '@actual-app/api/@types/loot-core/src/types/models'
import { formatCurrency } from './helpers/number'
import { existsSync, mkdirSync } from 'node:fs'
import logger from './helpers/logger'

// ... existing imports

const {
  ACTUAL_SERVER,
  ACTUAL_MAIN_PASSWORD,
  ACTUAL_SYNC_ID,
  ACTUAL_SYNC_PASSWORD,
  ACTUAL_PATH = '.actual-cache',
  TZ = 'UTC',
  // New env var: how many months to look ahead for "never" end dates
  FORECAST_MONTHS = '3', 
} = process.env

// ... existing setup logic

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
    const recurringData = schedule._date
    const nextDate = DateTime.fromISO(schedule.next_date)

    if (typeof recurringData === 'string' || !recurringData.frequency) {
      // Handle non-recurring/single events
      return calendar.createEvent({
        start: nextDate.toJSDate(),
        summary: `${schedule.name} (${formatAmount(schedule)})`,
        allDay: true,
        timezone: TZ,
      })
    }

    const getEndDate = () => {
      if (recurringData.endMode === 'never') {
        // Use the environment variable limit
        return forecastUntil
      }

      if (recurringData.endMode === 'after_n_occurrences') {
        // RRule handles 'count', so we return undefined for 'until'
        return undefined
      }

      return recurringData.endDate ? DateTime.fromISO(recurringData.endDate).toJSDate() : undefined
    }

    const getCount = () => {
      if (recurringData.endMode === 'after_n_occurrences') {
        return recurringData.endOccurrences
      }
      return undefined
    }

    // Build RRule options
    const ruleOptions = {
      freq: resolveFrequency(recurringData.frequency),
      // Use original start date so bi-weekly/monthly offsets are calculated correctly
      dtstart: DateTime.fromISO(recurringData.start).toJSDate(),
      until: getEndDate(),
      count: getCount(),
      // FIX: Use the interval from Actual (e.g., '2' for every two weeks)
      interval: recurringData.interval || 1,
      tzid: TZ,
    }

    const rule = new RRule(ruleOptions)

    // Filter and Map events
    rule.all().forEach((date) => {
      const eventDate = DateTime.fromJSDate(date)
      
      // Only include events from 'next_date' onwards
      if (eventDate < nextDate) return

      calendar.createEvent({
        start: moveOnWeekend(date, recurringData).toJSDate(),
        summary: `${schedule.name} (${formatAmount(schedule)})`,
        allDay: true,
        timezone: TZ,
      })
    })
  })

  return calendar.toString()
}

// Helper to keep the main loop clean
const formatAmount = (schedule: ScheduleEntity) => {
  const amount = schedule._amount
  if (typeof amount === 'number') return formatCurrency(amount)
  return `${formatCurrency(amount.num1)} ~ ${formatCurrency(amount.num2)}`
}

const moveOnWeekend = (date: Date, recurringData: RecurConfig) => {
  const dateTime = DateTime.fromJSDate(date)
  if (!recurringData.skipWeekend || (dateTime.weekday !== 6 && dateTime.weekday !== 7)) {
    return dateTime
  }

  if (recurringData.weekendSolveMode === 'after') {
    return dateTime.plus({ days: dateTime.weekday === 6 ? 2 : 1 })
  }

  if (recurringData.weekendSolveMode === 'before') {
    return dateTime.plus({ days: dateTime.weekday === 6 ? -1 : -2 })
  }
  
  return dateTime
}
