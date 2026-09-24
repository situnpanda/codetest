import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

let preferredTZ = 'America/Los_Angeles';
export function setPreferredTimezone(tz) {
  preferredTZ = tz;
}

export function convertTimeToPreferredTZ(data, format = 'YYYY-MM-DD HH:mm') {
    if (!data || typeof data !== 'object') return data;
  
    const updated = { ...data };
    const targetKeys = ['TimeGenerated', 'Timestamp', 'EventDate', 'Last Backup Date','Time Generated','EndTime','LastTriggered','DownTimeStart','DownTimeEnd','End Time','endTime','startTime']; 
  
    targetKeys.forEach((key) => {
      if (updated[key] && typeof updated[key] === 'object') {
        updated[key] = Object.fromEntries(
          Object.entries(updated[key]).map(([subKey, value]) => {
            const converted = dayjs.tz(value, 'America/Los_Angeles').tz(preferredTZ).format(format);
            return [subKey, converted];
          })
        );
      }
    });
  
    return updated;
}

export function convertTimeToPreferredTZ_fromUtc(data, format = 'YYYY-MM-DD HH:mm') {
    console.log(preferredTZ, data)
    if (!data || typeof data !== 'object') return data;
  
    const updated = { ...data };
    const targetKeys = ['TimeGenerated', 'Timestamp', 'EventDate', 'Last Backup Date','Time Generated','EndTime','LastTriggered','DownTimeStart','DownTimeEnd','End Time','endTime','startTime', 'Last Updated']; 
    const inputFormat = 'YYYY-MM-DD HH:mm:ssZ';
    targetKeys.forEach((key) => {
      if (updated[key] && typeof updated[key] === 'object') {
        updated[key] = Object.fromEntries(
          Object.entries(updated[key]).map(([subKey, value]) => {
            const converted = dayjs.utc(value,inputFormat).tz(preferredTZ).format(format);
            return [subKey, converted];
          })
        );
      }
    });
  
    return updated;
}

export function convertTimeToPreferredTZ_ToUtc(data, format = 'YYYY-MM-DD hh:mm:ss A') {
  const inputFormat = 'YYYY-MM-DD hh:mm:ss A'; 
  const converted = dayjs.tz(data,inputFormat, "America/Los_Angeles").utc().format(format);
  console.log(data, converted)  
  return converted.toString();
}
