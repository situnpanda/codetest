import React, { useState } from 'react';
import dayjs from 'dayjs';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import { PickersDay } from '@mui/x-date-pickers/PickersDay';

// Modern replacement for react-datepicker built on @mui/x-date-pickers.
// Supports the inline range use-case: selectsRange, startDate, endDate, onChange([start, end]), minDate, maxDate.
export default function DatePicker({
  selectsRange = false,
  selected = null,
  startDate = null,
  endDate = null,
  onChange,
  minDate,
  maxDate,
  inline, // always inline for our usage
  ...rest
}) {
  const [pendingStart, setPendingStart] = useState(null);
  const start = startDate ? dayjs(startDate) : null;
  const end = endDate ? dayjs(endDate) : null;

  const handleChange = (value) => {
    const d = value ? dayjs(value).toDate() : null;
    if (!selectsRange) {
      if (onChange) onChange(d);
      return;
    }
    // Range selection: first click sets start, second sets end.
    if (!pendingStart || (start && end)) {
      setPendingStart(d);
      if (onChange) onChange([d, null]);
    } else {
      const s = dayjs(pendingStart);
      const e = dayjs(d);
      const ordered = e.isBefore(s) ? [e.toDate(), s.toDate()] : [s.toDate(), e.toDate()];
      setPendingStart(null);
      if (onChange) onChange(ordered);
    }
  };

  const renderDay = (dayProps) => {
    const { day } = dayProps;
    const inRange =
      start && end && day && (day.isSame(start, 'day') || day.isSame(end, 'day') ||
        (day.isAfter(start, 'day') && day.isBefore(end, 'day')));
    return (
      <PickersDay
        {...dayProps}
        selected={
          (start && day.isSame(start, 'day')) || (end && day.isSame(end, 'day')) || dayProps.selected
        }
        sx={inRange ? { backgroundColor: '#dbeafe', color: '#1e40af' } : undefined}
      />
    );
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <DateCalendar
        value={end || start || (selected ? dayjs(selected) : null)}
        onChange={handleChange}
        minDate={minDate ? dayjs(minDate) : undefined}
        maxDate={maxDate ? dayjs(maxDate) : undefined}
        slots={{ day: renderDay }}
      />
    </LocalizationProvider>
  );
}
